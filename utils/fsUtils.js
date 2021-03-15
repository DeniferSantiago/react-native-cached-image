"use strict"

const _ = require("lodash")

const { CachesDirectoryPath, exists: existF, mkdir, stat, readdir, unlink, copyFile: copyF, downloadFile: downloadF, moveFile } = require("react-native-fs");

const activeDownloads = {}

function getDirPath(path) {
  // if path is a file (has ext) remove it
  if (path.charAt(path.length - 4) === "." || path.charAt(path.length - 5) === ".") {
    return _.initial(path.split("/")).join("/")
  }
  return path
}

function ensurePath(path) {
  const dirPath = getDirPath(path)
  return exists(dirPath)
    .then(isDir => {
      if (!isDir) {
        return (
          mkdir(dirPath)
            // check if dir has indeed been created because
            // there's no exception on incorrect user-defined paths (?)...
            .then(() => exists(dirPath))
            .then(exist => {
              if (!exist) {
                throw new Error("Invalid cacheLocation")
              }
            })
        )
      }
    })
    .catch(err => {
      const errorMessage = err.message.toLowerCase()
      // ignore folder already exists errors
      if (errorMessage.includes("already exists") && (errorMessage.includes("folder") || errorMessage.includes("directory"))) {
        return
      }

      return Promise.reject(err)
    })

  }
/**
 * 
 * @param {Strinf} basePath 
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
    throw [];
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
   * @param fromUrl   String source url
   * @param toFile    String destination path
   * @param headers   Object with headers to use when downloading the file
   * @returns {Promise}
   */
  downloadFile(fromUrl, toFile, headers) {
    // use toFile as the key as is was created using the cacheKey
    if (!_.has(activeDownloads, toFile)) {
      // using a temporary file, if the download is accidentally interrupted, it will not produce a disabled file
      const tmpFile = toFile + ".tmp"
      // create an active download for this file
      /**@returns {Promise<String>}*/
      activeDownloads[toFile] = async () => {
        if(await ensurePath()){
          var totalSize = 0;
          const { promise } = downloadF({
            toFile: tmpFile,
            fromUrl,
            headers,
            begin: val => (totalSize = val.contentLength)
          });
          const result = await promise;
          if(result.statusCode === 304){
            //!Al parecer no es necesario
            //await moveFile(tmpFile, toFile); 
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
        }
      };
    }
    return activeDownloads[toFile]
  },

  /**
   * remove the file in filePath if it exists.
   * this method always resolves
   * @param filePath
   * @returns {Promise}
   */
  async deleteFile(filePath) {
    try {
      const res = await stat(filePath);
      const exists = res && res.isFile();
      if(exists){
        await unlink(filePath);
      }
    } catch (err) {
      throw err;
    }
  },

  /**
   * copy a file from fromFile to toFile
   * @param fromFile
   * @param toFile
   * @returns {Promise}
   */
  async copyFile(fromFile, toFile) {
    await ensurePath(toFile);
    return await copyF(fromFile, toFile);
  },

  /**
   * remove the contents of dirPath
   * @param dirPath
   * @returns {Promise}
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
    return await ensurePath(dirPath);
  },

  /**
   * get info about files in a folder
   * @param dirPath
   * @returns {Promise.<{file:import("react-native-fs").StatResult[], size:Number}>}
   */
  async getDirInfo(dirPath) {
    const res = await stat(dirPath);
    if (res.isDirectory()) {
      const files = collectFilesInfo(dirPath);
      const size = _.sumBy(files, "size");
      return {
        files,
        size
      };
    } else {
      return Promise.reject("Dir does not exists");
    }
  },

  exists(path) {
    return existF(path)
  },
}
