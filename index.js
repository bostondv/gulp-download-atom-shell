var GitHub, PLUGIN_NAME, PluginError, Progress, async, fs, getApmPath, getCurrentAtomShellVersion, gutil, installAtomShell, isAtomShellVersionCached, isFile, os, path, saveAtomShellToCache, spawn, unzipAtomShell, wrench;

async = require('async');

fs = require('fs');

path = require('path');

os = require('os');

wrench = require('wrench');

GitHub = require('github-releases');

Progress = require('progress');

gutil = require('gulp-util');

PluginError = gutil.PluginError;

PLUGIN_NAME = "gulp-download-atom-shell";

spawn = function(options, callback) {
  var childProcess, error, proc, stderr, stdout;
  childProcess = require('child_process');
  stdout = [];
  stderr = [];
  error = null;
  proc = childProcess.spawn(options.cmd, options.args, options.opts);
  proc.stdout.on('data', function(data) {
    return stdout.push(data.toString());
  });
  proc.stderr.on('data', function(data) {
    return stderr.push(data.toString());
  });
  return proc.on('exit', function(code, signal) {
    var results;
    if (code !== 0) {
      error = new Error(signal);
    }
    results = {
      stderr: stderr.join(''),
      stdout: stdout.join(''),
      code: code
    };
    if (code !== 0) {
      gutil.log(PLUGIN_NAME, gutil.colors.red(results.stderr));
    }
    return callback(error, results, code);
  });
};

isFile = function(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile;
};

getApmPath = function() {
  var apmPath;
  apmPath = path.join('apm', 'node_modules', 'atom-package-manager', 'bin', 'apm');
  if (!isFile(apmPath)) {
    apmPath = 'apm';
  }
  if (process.platform === 'win32') {
    return "" + apmPath + ".cmd";
  } else {
    return apmPath;
  }
};

getCurrentAtomShellVersion = function(outputDir) {
  var versionPath;
  versionPath = path.join(outputDir, 'version');
  if (isFile(versionPath)) {
    return fs.readFileSync(versionPath).toString().trim();
  } else {
    return null;
  }
};

isAtomShellVersionCached = function(downloadDir, version) {
  return isFile(path.join(downloadDir, version, 'version'));
};

installAtomShell = function(outputDir, downloadDir, version) {
  return wrench.copyDirSyncRecursive(path.join(downloadDir, version), outputDir, {
    forceDelete: true,
    excludeHiddenUnix: false,
    inflateSymlinks: false
  });
};

unzipAtomShell = function(zipPath, callback) {
  var DecompressZip, directoryPath, unzipper;
  gutil.log(PLUGIN_NAME, 'Unzipping atom-shell.');
  directoryPath = path.dirname(zipPath);
  if (process.platform === 'darwin') {
    return spawn({
      cmd: 'unzip',
      args: [zipPath, '-d', directoryPath]
    }, function(error) {
      fs.unlinkSync(zipPath);
      return callback(error);
    });
  } else {
    DecompressZip = require('decompress-zip');
    unzipper = new DecompressZip(zipPath);
    unzipper.on('error', callback);
    unzipper.on('extract', function(log) {
      fs.closeSync(unzipper.fd);
      fs.unlinkSync(zipPath);
      return callback(null);
    });
    return unzipper.extract({
      path: directoryPath
    });
  }
};

saveAtomShellToCache = function(inputStream, outputDir, downloadDir, version, callback) {
  var cacheFile, len, outputStream, progress;
  wrench.mkdirSyncRecursive(path.join(downloadDir, version));
  cacheFile = path.join(downloadDir, version, 'atom-shell.zip');
  if (process.platform !== 'win32') {
    len = parseInt(inputStream.headers['content-length'], 10);
    progress = new Progress('downloading [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: len
    });
  }
  outputStream = fs.createWriteStream(cacheFile);
  inputStream.pipe(outputStream);
  inputStream.on('error', callback);
  outputStream.on('error', callback);
  outputStream.on('close', unzipAtomShell.bind(this, cacheFile, callback));
  return inputStream.on('data', function(chunk) {
    var _base, _base1;
    if (process.platform === 'win32') {
      return;
    }
    if (typeof (_base = process.stdout).clearLine === "function") {
      _base.clearLine();
    }
    if (typeof (_base1 = process.stdout).cursorTo === "function") {
      _base1.cursorTo(0);
    }
    return progress.tick(chunk.length);
  });
};

module.exports = function(options, cb) {
  var apm, currentAtomShellVersion, downloadDir, outputDir, rebuild, symbols, version;
  if (options == null) {
    options = {};
  }
  if (!((options.version != null) && (options.outputDir != null))) {
    throw new PluginError(PLUGIN_NAME, "version and outputDir option must be given!");
  }
  version = options.version, outputDir = options.outputDir, downloadDir = options.downloadDir, symbols = options.symbols, rebuild = options.rebuild, apm = options.apm;
  version = "v" + version;
  if (downloadDir == null) {
    downloadDir = path.join(os.tmpdir(), 'downloaded-atom-shell');
  }
  if (symbols == null) {
    symbols = false;
  }
  if (rebuild == null) {
    rebuild = false;
  }
  if (apm == null) {
    apm = getApmPath();
  }
  currentAtomShellVersion = getCurrentAtomShellVersion(outputDir);
  if (currentAtomShellVersion === version) {
    return cb();
  }
  return async.series([
    function(callback) {
      var github;
      if (!isAtomShellVersionCached(downloadDir, version)) {
        github = new GitHub({
          repo: 'atom/atom-shell'
        });
        return github.getReleases({
          tag_name: version
        }, function(error, releases) {
          var arch, asset, filename, found, _i, _len, _ref;
          if (!((releases != null ? releases.length : void 0) > 0)) {
            callback(new Error("Cannot find atom-shell " + version + " from GitHub"));
          }
          arch = (function() {
            switch (process.platform) {
              case 'win32':
                return 'ia32';
              case 'darwin':
                return 'x64';
              default:
                return process.arch;
            }
          })();
          filename = symbols ? "atom-shell-" + version + "-" + process.platform + "-" + arch + "-symbols.zip" : "atom-shell-" + version + "-" + process.platform + "-" + arch + ".zip";
          found = false;
          _ref = releases[0].assets;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            asset = _ref[_i];
            if (!(asset.name === filename)) {
              continue;
            }
            found = true;
            github.downloadAsset(asset, function(error, inputStream) {
              if (error != null) {
                callback(new Error("Cannot download atom-shell " + version));
              }
              gutil.log(PLUGIN_NAME, "Downloading atom-shell " + version + ".");
              return saveAtomShellToCache(inputStream, outputDir, downloadDir, version, function(error) {
                if (error != null) {
                  return callback(new Error("Failed to download atom-shell " + version));
                } else {
                  return callback();
                }
              });
            });
          }
          if (!found) {
            return callback(new Error("Cannot find " + filename + " in atom-shell " + version + " release"));
          }
        });
      } else {
        return callback();
      }
    }, function(callback) {
      installAtomShell(outputDir, downloadDir, version);
      return callback();
    }, function(callback) {
      if (rebuild && currentAtomShellVersion !== version) {
        gutil.log(PLUGIN_NAME, "Rebuilding native modules for new atom-shell version " + version + ".");
        if (apm == null) {
          apm = getApmPath();
        }
        return spawn({
          cmd: apm,
          args: ['rebuild']
        }, callback);
      } else {
        return callback();
      }
    }
  ], function(error, results) {
    if (error) {
      throw new PluginError(PLUGIN_NAME, error.message);
    } else {
      return cb();
    }
  });
};
