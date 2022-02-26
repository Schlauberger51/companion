import http from 'http'
import { server as WebSocketServer } from 'websocket'
import ServiceBase from './Base.js'

/**
 * Class providing the Elgato Plugin service.
 *
 * @extends ServiceBase
 * @author Håkon Nessjøen <haakon@bitfocus.io>
 * @author Keith Rocheck <keith.rocheck@gmail.com>
 * @author William Viker <william@bitfocus.io>
 * @author Julian Waller <me@julusian.co.uk>
 * @since 1.3.0
 * @copyright 2022 Bitfocus AS
 * @license
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for Companion along with
 * this program.
 *
 * You can be released from the requirements of the license by purchasing
 * a commercial license. Buying such a license is mandatory as soon as you
 * develop commercial activities involving the Companion software without
 * disclosing the source code of your own applications.
 */
class ServiceElgatoPlugin extends ServiceBase {
	/**
	 * The port to open the socket with.  Default: <code>28492</code>
	 * @type {number}
	 * @access protected
	 */
	port = 28492

	/**
	 * @param {Registry} registry - the application's core
	 */
	constructor(registry) {
		super(registry, 'elgato-plugin', 'lib/Service/ElgatoPlugin', 'elgato_plugin_enable')

		this.system.on('graphics_bank_invalidated', this.handleBankChanged.bind(this))

		this.init()
	}

	/**
	 * Close the socket before deleting it
	 * @access protected
	 */
	close() {
		if (this.ws) {
			this.ws.shutDown()
			delete this.ws
		}

		if (this.server) {
			this.server.close()
			delete this.server
		}
	}

	/**
	 *
	 * @param {string} page - the page number
	 * @param {string} bank - the bank number
	 */
	handleBankChanged(page, bank) {
		page = parseInt(page)
		bank = parseInt(bank) - 1

		if (this.client !== undefined && this.client.button_listeners !== undefined) {
			let listeners = this.client.button_listeners
			if (listeners[page] !== undefined && listeners[page][bank] !== undefined) {
				let button = this.graphics.getBank(page, parseInt(bank) + 1)

				this.client.apicommand('fillImage', { page: page, bank: bank, keyIndex: bank, data: button.buffer })
			}
		}
	}

	/**
	 * Setup the socket for v1 API
	 * @param {Socket} socket - the client socket
	 */
	initAPI1(socket) {
		this.debug('init api')
		socket.once('new_device', (id) => {
			this.debug('add device: ' + socket.remoteAddress, id)

			// Use ip right now, since the pluginUUID is new on each boot and makes Companion
			// forget all settings for the device. (page and orientation)
			id = 'elgato_plugin-' + socket.remoteAddress

			this.surfaces.addDevice({ path: id }, 'streamdeck_plugin')

			// Give elgato_plugin reference to socket
			this.system.emit(id + '_plugin_startup', socket)

			socket.apireply('new_device', { result: true })

			socket.on('get_instances', (args) => {
				socket.apireply('get_instances', {
					instances: this.db.getKey('instance'),
				})
			})

			socket.on('close', () => {
				this.surfaces.removeDevice(id)
				socket.removeAllListeners('keyup')
				socket.removeAllListeners('keydown')
			})
		})
	}

	/**
	 * Setup the socket for v2 API
	 * @param {Socket} socket - the client socket
	 */
	initAPI2(socket) {
		this.debug('init api v2')
		socket.once('new_device', (id) => {
			this.debug('add device: ' + socket.remoteAddress, id)

			// Use ip right now, since the pluginUUID is new on each boot and makes Companion
			// forget all settings for the device. (page and orientation)
			id = 'elgato_plugin-' + socket.remoteAddress

			this.surfaces.addDevice({ path: id }, 'streamdeck_plugin')

			// Give elgato_plugin reference to socket
			this.system.emit(id + '_plugin_startup', socket)

			socket.apireply('new_device', { result: true })

			socket.button_listeners = {
				dynamic: {},
				static: {},
			}

			this.client = socket

			socket.on('close', () => {
				delete socket.button_listeners
				this.surfaces.removeDevice(id)
				socket.removeAllListeners('keyup')
				socket.removeAllListeners('keydown')
				delete this.client
			})
		})

		socket.on('request_button', (args) => {
			this.debug('request_button: ', args)

			if (socket.button_listeners[args.page] === undefined) {
				socket.button_listeners[args.page] = {}
			}

			socket.button_listeners[args.page][args.bank] = 1
			socket.apireply('request_button', { result: 'ok' })

			this.handleBankChanged(args.page, parseInt(args.bank) + 1)
		})

		socket.on('unrequest_button', (args) => {
			this.debug('unrequest_button: ', args)

			if (socket.button_listeners[args.page]) {
				delete socket.button_listeners[args.page][args.bank]
			}

			socket.apireply('request_button', { result: 'ok' })
		})
	}

	/**
	 * Setup the socket processing and rig the appropriate version processing
	 * @param {Socket} socket - the client socket
	 */
	initSocket(socket) {
		socket.apireply = this.socketResponse.bind(this, socket)
		socket.apicommand = this.socketCommand.bind(this, socket)

		socket.on('version', (args) => {
			if (args.version > 2) {
				// Newer than current api version
				socket.apireply('version', { version: 2, error: 'cannot continue' })
				socket.close()
			} else if (args.version === 1) {
				// Support old clients
				socket.apireply('version', { version: 1 })

				this.initAPI1(socket)
			} else {
				socket.apireply('version', { version: 2 })

				this.initAPI2(socket)
			}
		})
	}

	/**
	 * Start the service if it is not already running
	 * @access protected
	 */
	listen() {
		if (this.portConfig !== undefined) {
			this.port = this.userconfig.getKey(this.portConfig)
		}

		if (this.server === undefined) {
			try {
				this.server = http.createServer((request, response) => {
					response.writeHead(404)
					response.end('Not found')
				})

				this.server.on('error', this.handleSocketError.bind(this))

				this.server.listen(this.port)

				this.ws = new WebSocketServer({
					httpServer: this.server,
					autoAcceptConnections: false,
				})

				this.ws.on('request', this.processIncoming.bind(this))
				this.log('info', 'Listening on port ' + this.port)
				this.debug('Listening on port ' + this.port)
			} catch (e) {
				this.log('error', `Could not launch: ${e.message}`)
			}
		}
	}

	/**
	 * Set up a new socket connection
	 * @param {WebSocketRequest} req - the request
	 */
	processIncoming(req) {
		const socket = req.accept('', req.origin)
		this.debug('New connection from ' + socket.remoteAddress)

		this.initSocket(socket)

		socket.on('message', (message) => {
			if (message.type == 'utf8') {
				try {
					let data = JSON.parse(message.utf8Data)
					socket.emit(data.command, data.arguments)
					//this.debug('emitting command ' + data.command);
				} catch (e) {
					this.debug('protocol error:', e)
				}
			}
		})

		socket.on('close', () => {
			this.debug('Connection from ' + socket.remoteAddress + ' disconnected')
		})
	}

	/**
	 * Package and send a command
	 * @param {Socket} socket - the client socket
	 * @param {string} command - the command
	 * @param {Object} args - arguemtns for the command
	 */
	socketCommand(socket, command, args) {
		socket.sendUTF(JSON.stringify({ command: command, arguments: args }))
	}

	/**
	 * Package and send a response
	 * @param {Socket} socket - the client socket
	 * @param {string} command - the command
	 * @param {Object} args - arguemtns for the command
	 */
	socketResponse(socket, command, args) {
		socket.sendUTF(JSON.stringify({ response: command, arguments: args }))
	}
}

export default ServiceElgatoPlugin
