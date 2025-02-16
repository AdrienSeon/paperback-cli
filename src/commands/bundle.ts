/* eslint-disable no-console */
import {flags} from '@oclif/command'
import Command from '../command'
import * as path from 'path'
import * as fs from 'fs'

import * as browserify from 'browserify'
import * as shelljs from 'shelljs'
import Utils from '../utils'

import * as updateNotifier from 'update-notifier'
const pkg = require('../../package.json')

export default class Bundle extends Command {
  static description =
    'Builds all the sources in the repository and generates a versioning file';

  static flags = {
    help: flags.help({char: 'h'}),
    folder: flags.string({description: 'Subfolder to output to', required: false}),
    sourceslocation: flags.string({description: 'Subfolder where sources are located', required: false}),
  };

  async run() {
    updateNotifier({pkg, updateCheckInterval: 0}).notify()
    const {flags} = this.parse(Bundle)

    this.log(`Working directory: ${process.cwd()}`)
    this.log()

    const execTime = this.time('Execution time', Utils.headingFormat)
    await this.bundleSources(flags.folder, flags.sourceslocation)

    const versionTime = this.time('Versioning File', Utils.headingFormat)
    await this.generateVersioningFile(flags.folder)
    versionTime.end()
    this.log()

    execTime.end()
  }

  async generateVersioningFile(folder = '') {
    const jsonObject = {
      buildTime: new Date(),
      sources: [] as any[],
    }

    // joining path of directory
    const basePath = process.cwd()
    const directoryPath = path.join(basePath, 'bundles', folder)

    const promises = fs.readdirSync(directoryPath).map(async file => {
      try {
        const time = this.time(`- Generating ${file} Info`)
        const sourceInfo = await this.generateSourceInfo(file, directoryPath)
        jsonObject.sources.push(sourceInfo)
        time.end()
      } catch (error) {
        this.log(`- ${file} ${error}`)
      }
    })

    await Promise.all(promises)

    // Write the JSON payload to file
    fs.writeFileSync(
      path.join(directoryPath, 'versioning.json'),
      JSON.stringify(jsonObject)
    )
  }

  async generateSourceInfo(sourceId: string, directoryPath: string) {
    // Files starting with . should be ignored (hidden) - Also ignore the tests directory
    if (sourceId.startsWith('.') || sourceId.startsWith('tests')) {
      return Promise.resolve()
    }

    // If its a directory
    if (!fs.statSync(path.join(directoryPath, sourceId)).isDirectory()) {
      this.log('not a Directory, skipping ' + sourceId)
      return Promise.resolve()
    }

    const finalPath = path.join(directoryPath, sourceId, 'source.js')

    return new Promise<any>((res, rej) => {
      const req = require(finalPath)

      const classInstance = req[`${sourceId}Info`]

      // make sure the icon is present in the includes folder.
      if (!fs.existsSync(path.join(directoryPath, sourceId, 'includes', classInstance.icon))) {
        rej(new Error('[ERROR] [' + sourceId + '] Icon must be inside the includes folder'))
        return
      }

      res({
        id: sourceId,
        name: classInstance.name,
        author: classInstance.author,
        desc: classInstance.description,
        website: classInstance.authorWebsite,
        version: classInstance.version,
        icon: classInstance.icon,
        tags: classInstance.sourceTags,
        websiteBaseURL: classInstance.websiteBaseURL,
      })
    })
  }

  async bundleSources(folder = '', sourcesLocation = '') {
    const basePath = process.cwd()

    // Make sure there isn't a built folder already
    Utils.deleteFolderRecursive(path.join(basePath, 'temp_build'))

    const transpileTime = this.time('Transpiling project', Utils.headingFormat)
    shelljs.exec('npx tsc --outDir temp_build')
    transpileTime.end()

    this.log()

    const bundleTime = this.time('Bundle time', Utils.headingFormat)
    const baseBundlesPath = path.join(basePath, 'bundles')
    const bundlesPath = path.join(baseBundlesPath, folder)

    Utils.deleteFolderRecursive(bundlesPath)

    fs.mkdirSync(bundlesPath, {recursive: true})

    if (sourcesLocation === '') {
      const directoryPath = path.join(basePath, 'temp_build')
      const promises: Promise<void>[] = fs.readdirSync(directoryPath).map(async file => {
        const fileBundleTime = this.time(`- Building ${file}`)

        Utils.copyFolderRecursive(
          path.join(basePath, 'src', file, 'external'),
          path.join(directoryPath, file)
        )

        await this.bundle(file, directoryPath, bundlesPath)

        Utils.copyFolderRecursive(
          path.join(basePath, 'src', file, 'includes'),
          path.join(bundlesPath, file)
        )
        fileBundleTime.end()
      })

      await Promise.all(promises)
    } else {
      const directoryPath = path.join(basePath, 'temp_build', sourcesLocation)
      const promises: Promise<void>[] = fs.readdirSync(directoryPath).map(async file => {
        const fileBundleTime = this.time(`- Building ${file}`)

        Utils.copyFolderRecursive(
          path.join(basePath, 'src', sourcesLocation, file, 'external'),
          path.join(directoryPath, file)
        )

        await this.bundle(file, directoryPath, bundlesPath)

        Utils.copyFolderRecursive(
          path.join(basePath, 'src', sourcesLocation, file, 'includes'),
          path.join(bundlesPath, file)
        )
        fileBundleTime.end()
      })

      await Promise.all(promises)
    }

    bundleTime.end()

    this.log()
    // Remove the build folder
    Utils.deleteFolderRecursive(path.join(basePath, 'temp_build'))
  }

  async bundle(file: string, sourceDir: string, destDir: string)  {
    if (file === 'tests') {
      this.log('Tests directory, skipping')
      return Promise.resolve()
    }

    // If its a directory
    if (!fs.statSync(path.join(sourceDir, file)).isDirectory()) {
      this.log('Not a directory, skipping ' + file)
      return Promise.resolve()
    }

    const filePath = path.join(sourceDir, file, `/${file}.js`)

    if (!fs.existsSync(filePath)) {
      this.log("The file doesn't exist, skipping. " + file)
      return Promise.resolve()
    }

    const outputPath = path.join(destDir, file)
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath)
    }

    return new Promise<void>(res => {
      browserify([filePath], {standalone: 'Sources'})
      .ignore('./node_modules/paperback-extensions-common/dist/APIWrapper.js')
      .external(['axios', 'cheerio', 'fs'])
      .bundle()
      .pipe(
        fs.createWriteStream(path.join(outputPath, 'source.js')).on('finish', () => {
          res()
        })
      )
    })
  }
}
