"use strict"

const _ = require("lodash");

const { CachesDirectoryPath, exists: existF, mkdir, stat, readdir, unlink, copyFile: copyF, downloadFile: downloadF, moveFile } = require("react-native-fs");

const activeDownloads = {}
/**
 * @param {String} path 
 * @returns {String}
 */
function getDirPath(path) {
  // if path is a file (has ext) remove it
  if (path.charAt(path.length - 4) === "." || path.charAt(path.length - 5) === ".") {
    return _.initial(path.split("/")).join("/")
  }
  return path
}
/**
 * @param {String} path
 */
async function ensurePath(path) {
  const dirPath = getDirPath(path)
  try {
    const isDir = await existF(dirPath);
    if (!isDir) {
      // check if dir has indeed been created because
      // there's no exception on incorrect user-defined paths (?)...
      await mkdir(dirPath)
      const exist = await existF(dirPath);
      if (!exist) {
        throw new Error("Invalid cacheLocation");
      }
    }
  } catch (err) {
    const errorMessage = err.message.toLowerCase();
    // ignore folder already exists errors
    if (errorMessage.includes("already exists") && (errorMessage.includes("folder") || errorMessage.includes("directory"))) {
      return;
    }
    throw err;
  }
}
/**
 * @param {String} basePath 
 * @returns {Promise<import("react-native-fs").StatResult[]>}
 */
async function collectFilesInfo(basePath) {
  try {
    const info = await stat(basePath);
    if (info.isFile()) {
      return info;
    }
    const files = await readdir(basePath);
    const promises = _.map(files, file => {
      return collectFilesInfo(`${basePath}/${file}`);
    });
    return await Promise.all(promises);
  } catch (err) {
    return null;
  }
}
/**
 * wrapper around common filesystem actions
 */
module.exports = {
  /**
   * returns the local cache dir
   * @returns {String}
   */
  getCacheDir() {
    return CachesDirectoryPath + "/imagesCacheDir"
  },
  /**
   * returns a promise that is resolved when the download of the requested file
   * is complete and the file is saved.
   * if the download fails, or was stopped the partial file is deleted, and the
   * promise is rejected
   * @param {String} fromUrl   String source url
   * @param {String} toFile    String destination path
   * @param {Object} headers   Object with headers to use when downloading the file
   */
  downloadFile(fromUrl, toFile, headers) {
    // use toFile as the key as is was created using the cacheKey
    if (!_.has(activeDownloads, toFile)) {
      // using a temporary file, if the download is accidentally interrupted, it will not produce a disabled file
      const tmpFile = toFile + ".tmp";
      // create an active download for this file
      /**@returns {Promise<String>}*/
      activeDownloads[toFile] = async () => {
        await ensurePath();
        var totalSize = 0;
        const { promise } = downloadF({
          toFile: tmpFile,
          fromUrl,
          headers,
          begin: val => (totalSize = val.contentLength)
        });
        const result = await promise;
        if(result.statusCode === 304) {
          return toFile;
        }
        let status = Math.floor(result.statusCode / 100)
        if (status !== 2) {
          throw new Error("Cannot download image, status code: " + result.statusCode);
        }
        const stats = await stat(tmpFile);
        if(totalSize !== stats.size) {
          throw new Error("Download failed, the image could not be fully downloaded");
        }
        await moveFile(tmpFile, toFile);
        this.deleteFile(tmpFile)
        delete activeDownloads[toFile];
        return toFile;
      };
    }
    return activeDownloads[toFile];
  },
  /**
   * remove the file in filePath if it exists.
   * @param {String} filePath
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    try {
      const res = await stat(filePath);
      const exists = res.isFile();
      if(exists) {
        await unlink(filePath);
      }
    } catch (err) {
      throw err;
    }
  },
  /**
   * copy a file from fromFile to toFile
   * @param {String} fromFile
   * @param {String} toFile
   */
  async copyFile(fromFile, toFile) {
    await ensurePath(toFile);
    return await copyF(fromFile, toFile);
  },
  /**
   * remove the contents of dirPath
   * @param {String} dirPath
   */
  async cleanDir(dirPath) {
    try {
      const res = await stat(dirPath);
      if(res.isDirectory()){
        await unlink(dirPath);
      }
    } catch (e) {
      throw e;
    }
    await ensurePath(dirPath);
  },
  /**
   * get info about files in a folder
   * @param dirPath
   * @returns {Promise.<{file:import("react-native-fs").StatResult[], size:Number}>}
   */
  async getDirInfo(dirPath) {
    const res = await stat(dirPath);
    if (res.isDirectory()) {
      const files = await collectFilesInfo(dirPath);
      const size = _.sumBy(files, "size");
      return {
        files,
        size
      };
    } else {
      throw new Error("Dir does not exists in 'getDirInfo'");
    }
  },
  /**
   * @param {String} path 
   */
  exists(path) {
    return existF(path)
  },
}
