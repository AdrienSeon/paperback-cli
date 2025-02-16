"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-console */
const command_1 = require("@oclif/command");
const command_2 = require("../command");
const path = require("path");
const fs = require("fs");
const browserify = require("browserify");
const shelljs = require("shelljs");
const utils_1 = require("../utils");
const updateNotifier = require("update-notifier");
const pkg = require('../../package.json');
class Bundle extends command_2.default {
    async run() {
        updateNotifier({ pkg, updateCheckInterval: 0 }).notify();
        const { flags } = this.parse(Bundle);
        this.log(`Working directory: ${process.cwd()}`);
        this.log();
        const execTime = this.time('Execution time', utils_1.default.headingFormat);
        await this.bundleSources(flags.folder, flags.sourceslocation);
        const versionTime = this.time('Versioning File', utils_1.default.headingFormat);
        await this.generateVersioningFile(flags.folder);
        versionTime.end();
        this.log();
        execTime.end();
    }
    async generateVersioningFile(folder = '') {
        const jsonObject = {
            buildTime: new Date(),
            sources: [],
        };
        // joining path of directory
        const basePath = process.cwd();
        const directoryPath = path.join(basePath, 'bundles', folder);
        const promises = fs.readdirSync(directoryPath).map(async (file) => {
            try {
                const time = this.time(`- Generating ${file} Info`);
                const sourceInfo = await this.generateSourceInfo(file, directoryPath);
                jsonObject.sources.push(sourceInfo);
                time.end();
            }
            catch (error) {
                this.log(`- ${file} ${error}`);
            }
        });
        await Promise.all(promises);
        // Write the JSON payload to file
        fs.writeFileSync(path.join(directoryPath, 'versioning.json'), JSON.stringify(jsonObject));
    }
    async generateSourceInfo(sourceId, directoryPath) {
        // Files starting with . should be ignored (hidden) - Also ignore the tests directory
        if (sourceId.startsWith('.') || sourceId.startsWith('tests')) {
            return Promise.resolve();
        }
        // If its a directory
        if (!fs.statSync(path.join(directoryPath, sourceId)).isDirectory()) {
            this.log('not a Directory, skipping ' + sourceId);
            return Promise.resolve();
        }
        const finalPath = path.join(directoryPath, sourceId, 'source.js');
        return new Promise((res, rej) => {
            const req = require(finalPath);
            const classInstance = req[`${sourceId}Info`];
            // make sure the icon is present in the includes folder.
            if (!fs.existsSync(path.join(directoryPath, sourceId, 'includes', classInstance.icon))) {
                rej(new Error('[ERROR] [' + sourceId + '] Icon must be inside the includes folder'));
                return;
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
            });
        });
    }
    async bundleSources(folder = '', sourcesLocation = '') {
        const basePath = process.cwd();
        // Make sure there isn't a built folder already
        utils_1.default.deleteFolderRecursive(path.join(basePath, 'temp_build'));
        const transpileTime = this.time('Transpiling project', utils_1.default.headingFormat);
        shelljs.exec('npx tsc --outDir temp_build');
        transpileTime.end();
        this.log();
        const bundleTime = this.time('Bundle time', utils_1.default.headingFormat);
        const baseBundlesPath = path.join(basePath, 'bundles');
        const bundlesPath = path.join(baseBundlesPath, folder);
        utils_1.default.deleteFolderRecursive(bundlesPath);
        fs.mkdirSync(bundlesPath, { recursive: true });
        if (sourcesLocation === '') {
            const directoryPath = path.join(basePath, 'temp_build');
            const promises = fs.readdirSync(directoryPath).map(async (file) => {
                const fileBundleTime = this.time(`- Building ${file}`);
                utils_1.default.copyFolderRecursive(path.join(basePath, 'src', file, 'external'), path.join(directoryPath, file));
                await this.bundle(file, directoryPath, bundlesPath);
                utils_1.default.copyFolderRecursive(path.join(basePath, 'src', file, 'includes'), path.join(bundlesPath, file));
                fileBundleTime.end();
            });
            await Promise.all(promises);
        }
        else {
            const directoryPath = path.join(basePath, 'temp_build', sourcesLocation);
            const promises = fs.readdirSync(directoryPath).map(async (file) => {
                const fileBundleTime = this.time(`- Building ${file}`);
                utils_1.default.copyFolderRecursive(path.join(basePath, 'src', sourcesLocation, file, 'external'), path.join(directoryPath, file));
                await this.bundle(file, directoryPath, bundlesPath);
                utils_1.default.copyFolderRecursive(path.join(basePath, 'src', sourcesLocation, file, 'includes'), path.join(bundlesPath, file));
                fileBundleTime.end();
            });
            await Promise.all(promises);
        }
        bundleTime.end();
        this.log();
        // Remove the build folder
        utils_1.default.deleteFolderRecursive(path.join(basePath, 'temp_build'));
    }
    async bundle(file, sourceDir, destDir) {
        if (file === 'tests') {
            this.log('Tests directory, skipping');
            return Promise.resolve();
        }
        // If its a directory
        if (!fs.statSync(path.join(sourceDir, file)).isDirectory()) {
            this.log('Not a directory, skipping ' + file);
            return Promise.resolve();
        }
        const filePath = path.join(sourceDir, file, `/${file}.js`);
        if (!fs.existsSync(filePath)) {
            this.log("The file doesn't exist, skipping. " + file);
            return Promise.resolve();
        }
        const outputPath = path.join(destDir, file);
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath);
        }
        return new Promise(res => {
            browserify([filePath], { standalone: 'Sources' })
                .ignore('./node_modules/paperback-extensions-common/dist/APIWrapper.js')
                .external(['axios', 'cheerio', 'fs'])
                .bundle()
                .pipe(fs.createWriteStream(path.join(outputPath, 'source.js')).on('finish', () => {
                res();
            }));
        });
    }
}
exports.default = Bundle;
Bundle.description = 'Builds all the sources in the repository and generates a versioning file';
Bundle.flags = {
    help: command_1.flags.help({ char: 'h' }),
    folder: command_1.flags.string({ description: 'Subfolder to output to', required: false }),
    sourceslocation: command_1.flags.string({ description: 'Subfolder where sources are located', required: false }),
};
