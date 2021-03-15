'use strict';

const _ = require('lodash');

const fsUtils = require('./utils/fsUtils');
const pathUtils = require('./utils/pathUtils');
const MemoryCache = require('react-native-async-storage-cache/MemoryCache').default;

module.exports = (defaultOptions = {}, urlCache = MemoryCache, fs = fsUtils, path = pathUtils) => {

    const defaultDefaultOptions = {
        headers: {},
        ttl: 3600 * 24 * 30,   // 60 * 60 * 24 * 14, // 2 weeks
        useQueryParamsInCacheKey: false,
        cacheLocation: fs.getCacheDir(),
        allowSelfSignedSSL: true,   // false,
    };

    // apply default options
    _.defaults(defaultOptions, defaultDefaultOptions);

    function isCacheable(url) {
        return _.isString(url) && (_.startsWith(url.toLowerCase(), 'http://') || _.startsWith(url.toLowerCase(), 'https://'));
    }
    /**
     * @param {String} url 
     * @param {Object} options
     * @param {(path: String) => Promise<void>} getCachedFile 
     */
    async function cacheUrl(url, options, getCachedFile) {
        if (!isCacheable(url)) {
            return Promise.reject(new Error('Url is not cacheable'));
        }
        // allow CachedImage to provide custom options
        _.defaults(options, defaultOptions);
        // cacheableUrl contains only the needed query params
        const cacheableUrl = path.getCacheableUrl(url, options.useQueryParamsInCacheKey);
        // note: urlCache may remove the entry if it expired so we need to remove the leftover file manually
        try {
            const fileRelativePath = await urlCache.get(cacheableUrl);
            if (!fileRelativePath) {
                // console.log('ImageCacheManager: url cache miss', cacheableUrl);
                throw new Error('URL expired or not in cache');
            }
            // console.log('ImageCacheManager: url cache hit', cacheableUrl);
            const cachedFilePath = `${options.cacheLocation}/${fileRelativePath}`;
            const exists = await fs.exists(cachedFilePath);
            if (exists) {
                return cachedFilePath;
            } else {
                throw new Error('file under URL stored in url cache doesn\'t exists');
            }
        } catch (e) {
            const fileRelativePath_1 = path.getImageRelativeFilePath(cacheableUrl);
            const filePath = `${options.cacheLocation}/${fileRelativePath_1}`;
            await fs.deleteFile(filePath);
            getCachedFile(filePath);
            await urlCache.set(cacheableUrl, fileRelativePath_1, options.ttl);
            return filePath;
        }
    }
    return {
        /**
         * download an image and cache the result according to the given options
         * @param {String} url
         * @param {Object} options
         */
        downloadAndCacheUrl(url, options = {}) {
            return cacheUrl(
                url,
                options,
                filePath => fs.downloadFile(url, filePath, options.headers)
            );
        },
        /**
         * seed the cache for a specific url with a local file
         * @param {String} url
         * @param {String} seedPath
         * @param options
         */
        seedAndCacheUrl(url, seedPath, options = {}) {
            return cacheUrl(
                url,
                options,
                filePath => fs.copyFile(seedPath, filePath)
            );
        },
        /**
         * delete the cache entry and file for a given url
         * @param {String} url
         * @param {Object} options
         */
        async deleteUrl(url, options = {}) {
            try {
                if (!isCacheable(url)) {
                    throw new Error('Url is not cacheable');
                }
                _.defaults(options, defaultOptions);
                const cacheableUrl = path.getCacheableUrl(url, options.useQueryParamsInCacheKey);
                const filePath = path.getImageFilePath(cacheableUrl, options.cacheLocation);
                // remove file from cache
                await urlCache.remove(cacheableUrl);
                return await fs.deleteFile(filePath);
            } catch (e) {
                throw e;
            }
        },
        /**
         * delete all cached file from the filesystem and cache
         * @param {Object} options
         */
        async clearCache(options = {}) {
            _.defaults(options, defaultOptions);
            await urlCache.flush();
            return await fs.cleanDir(options.cacheLocation);
        },
        /**
         * return info about the cache, list of files and the total size of the cache
         * @param options
         */
        getCacheInfo(options = {}) {
            _.defaults(options, defaultOptions);
            return fs.getDirInfo(options.cacheLocation);
        },
    };
};
