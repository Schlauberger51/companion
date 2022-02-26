import debug0 from 'debug'

const debug = debug0('lib/Resources/Util')

export const argb = (a, r, g, b, base = 10) => {
	a = parseInt(r, base)
	r = parseInt(r, base)
	g = parseInt(g, base)
	b = parseInt(b, base)

	if (isNaN(a) || isNaN(r) || isNaN(g) || isNaN(b)) return false
	return (
		a * 0x1000000 + rgb(r, g, b) // bitwise doesn't work because JS bitwise is working with 32bit signed int
	)
}

export const decimalToRgb = (decimal) => {
	return {
		red: (decimal >> 16) & 0xff,
		green: (decimal >> 8) & 0xff,
		blue: decimal & 0xff,
	}
}

export const delay = (milliseconds) => {
	return new Promise((resolve) => {
		setTimeout(() => resolve(), milliseconds)
	})
}

export const from15to32 = (key) => {
	key = key - 1

	let rows = Math.floor(key / 5)
	let col = (key % 5) + 1
	let res = rows * 8 + col

	if (res >= 32) {
		debug('from15to32: assert: old config had bigger pages than expected')
		return 31
	}
	return res
}

export const isFalsey = (val) => {
	return (typeof val === 'string' && val.toLowerCase() == 'false') || val == '0'
}

export const parseLineParameters = (line) => {
	// https://newbedev.com/javascript-split-string-by-space-but-ignore-space-in-quotes-notice-not-to-split-by-the-colon-too
	const fragments = line.match(/\\?.|^$/g).reduce(
		(p, c) => {
			if (c === '"') {
				p.quote ^= 1
			} else if (!p.quote && c === ' ') {
				p.a.push('')
			} else {
				p.a[p.a.length - 1] += c.replace(/\\(.)/, '$1')
			}
			return p
		},
		{ a: [''] }
	).a

	const res = {}

	for (const fragment of fragments) {
		const [key, value] = fragment.split('=')
		res[key] = value === undefined ? true : value
	}

	return res
}

export const rgb = (r, g, b, base = 10) => {
	r = parseInt(r, base)
	g = parseInt(g, base)
	b = parseInt(b, base)

	if (isNaN(r) || isNaN(g) || isNaN(b)) return false
	return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
}

export const rgbRev = (dec) => {
	dec = Math.round(dec)

	return {
		r: (dec & 0xff0000) >> 16,
		g: (dec & 0x00ff00) >> 8,
		b: dec & 0x0000ff,
	}
}

export const sendResult = (client, answer, name, ...args) => {
	if (typeof answer === 'function') {
		answer(...args)
	} else {
		client.emit(name, ...args)
	}
}

// From Global key number 0->31, to Device key f.ex 0->14
// 0-4 would be 0-4, but 5-7 would be -1
// and 8-12 would be 5-9
export const toDeviceKey = (keysTotal, keysPerRow, key) => {
	if (keysTotal == global.MAX_BUTTONS) {
		return key
	}

	if (key % global.MAX_BUTTONS_PER_ROW > keysPerRow) {
		return -1
	}

	let row = Math.floor(key / global.MAX_BUTTONS_PER_ROW)
	let col = key % global.MAX_BUTTONS_PER_ROW

	if (row >= keysTotal / keysPerRow || col >= keysPerRow) {
		return -1
	}

	return row * keysPerRow + col
}

// From device key number to global key number
// Reverse of toDeviceKey
export const toGlobalKey = (keysPerRow, key) => {
	let rows = Math.floor(key / keysPerRow)
	let col = key % keysPerRow

	return rows * global.MAX_BUTTONS_PER_ROW + col
}

export async function showFatalError(title, message) {
	let electron
	try {
		electron = await import('electron')
	} catch (e) {
		// This is fine
	}

	if (electron && electron.dialog) {
		dialog.showErrorBox(title, message)
	} else {
		console.error(message)
	}
	process.exit(1)
}
