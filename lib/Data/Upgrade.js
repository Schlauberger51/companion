import debug0 from 'debug'
import fs from 'fs-extra'

import v1tov2 from './Upgrades/v1tov2.js'
import v2tov3 from './Upgrades/v2tov3.js'

const debug = debug0('lib/Data/Upgrade')

const allUpgrades = [
	v1tov2, // 15 to 32 key
	v2tov3, // actions and release_actions to action_sets
]
const targetVersion = allUpgrades.length + 1

/**
 * Upgrade the db to the latest version.
 * This has the raw db object before anything else has gotten access, so no need to worry about other components getting confused
 */
export function upgradeStartup(db) {
	const currentVersion = db.getKey('page_config_version', 1)
	debug(`Upgrading db from ${currentVersion} to ${targetVersion}`)

	// Ensure that the db isnt too new
	if (currentVersion > targetVersion) {
		const message =
			'You have previously installed a much newer version of companion. Since the configuration files are incompatible between major versions of companion, you need to remove the old config before continuing with this version.'
		showFatalError('Error starting companion', message)
		process.exit(1)
	}

	const saveUpgradeCopy = (db, i) => {
		try {
			let jsonSave = db.getJSON()

			if (jsonSave !== undefined) {
				fs.writeFileSync(`${db.getCfgFile()}.v${i}`, jsonSave)
			}
		} catch (err) {
			debug(`db_save`, `Error saving upgrade copy: ${err}`)
		}
	}

	// run the scripts
	for (let i = currentVersion; i < targetVersion; i++) {
		saveUpgradeCopy(db, i)
		allUpgrades[i - 1].upgradeStartup(db)
	}

	// track the new version
	db.setKey('page_config_version', targetVersion)

	// force a save
	db.save()
}

/**
 * Upgrade an exported page or full configuration to the latest format
 */
export function upgradeImport(obj) {
	const currentVersion = obj.version || 1

	for (let i = currentVersion; i < targetVersion; i++) {
		// Run if a script is defined
		if (allUpgrades[i - 1].upgradeImport) {
			obj = allUpgrades[i - 1].upgradeImport(obj)
		}
	}

	obj.version = targetVersion
	return obj
}
