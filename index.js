"use strict;"

var path = require('path');
var fs = require('fs');
var stripAnsi = require('strip-ansi');
var mkdirp = require('mkdirp');

var assets = {};
var DEFAULT_OUTPUT_FILENAME = 'webpack-stats.json';
var DEFAULT_ASSETS_IDENTIFIER = 'exported_assets';
var DEFAULT_LOG_TIME = false;


function Plugin(options) {
  this.contents = {};
  this.options = options || {};
  this.options.filename = this.options.filename || DEFAULT_OUTPUT_FILENAME;
  this.options.assetsIdentifier = this.options.assetsIdentifier || DEFAULT_ASSETS_IDENTIFIER;
  if (this.options.logTime === undefined) {
    this.options.logTime = DEFAULT_LOG_TIME;
  }
}

var buildAsset = function(compiler, chunk, fileName) {
  var asset = {name: fileName};
  if (compiler.options.output.publicPath) {
    asset.publicPath = compiler.options.output.publicPath + fileName;
  }
  if (compiler.options.output.path) {
    asset.path = path.join(compiler.options.output.path, fileName);
  }
  return asset;
};

var buildChunk = function(compiler, chunk) {
  var files = chunk.files.map(function(file){
    var F = {name: file};
    if (compiler.options.output.publicPath) {
      F.publicPath= compiler.options.output.publicPath + file;
    }
    if (compiler.options.output.path) {
      F.path = path.join(compiler.options.output.path, file);
    }
    return F;
  });
  return files;
};

Plugin.prototype.apply = function(compiler) {
    var self = this;

    compiler.plugin('compilation', function(compilation, callback) {
      compilation.plugin('failed-module', function(fail){
        var output = {
          status: 'error',
          error: fail.error.name || 'unknown-error'
        };
        if (fail.error.module !== undefined) {
          output.file = fail.error.module.userRequest;
        }
        if (fail.error.error !== undefined) {
          output.message = stripAnsi(fail.error.error.codeFrame);
        }
        self.writeOutput(compiler, output);
      });
    });

    compiler.plugin('compile', function(factory, callback) {
      self.writeOutput(compiler, {status: 'compiling'});
    });

    compiler.plugin('done', function(stats){
      if (stats.compilation.errors.length > 0) {
        var error = stats.compilation.errors[0];
        self.writeOutput(compiler, {
          status: 'error',
          error: error['name'] || 'unknown-error',
          message: stripAnsi(error['message'])
        });
        return;
      }

      var chunks = {};
      var assets = {};
      stats.compilation.chunks.map(function(chunk) {
        if (chunk.name == self.options.assetsIdentifier){
          // each module represents a list of assets with only one item or the file itself/ improper loaded assets
          chunk.modules.map(function(module){
            var fileName = Object.keys(module.assets)[0];
            if (fileName !== undefined && fileName.endsWith(self.options.assetsIdentifier + ".js") !== true) {
              assets[module.rawRequest] = buildAsset(compiler, chunk, fileName);
            }
          });
        } else {
          chunks[chunk.name] = buildChunk(compiler, chunk);
        }
      });

      var output = {
        status: 'done',
        chunks: chunks
      };
      output[self.options.assetsIdentifier] = assets;

      if (self.options.logTime === true) {
        output.startTime = stats.startTime;
        output.endTime = stats.endTime;
      }

      self.writeOutput(compiler, output);
    });
};


Plugin.prototype.writeOutput = function(compiler, contents) {
  var outputDir = this.options.path || '.';
  var outputFilename = path.join(outputDir, this.options.filename || DEFAULT_OUTPUT_FILENAME);
  if (compiler.options.output.publicPath) {
    contents.publicPath = compiler.options.output.publicPath;
  }
  mkdirp.sync(path.dirname(outputFilename));

  this.contents = Object.assign(this.contents, contents);
  fs.writeFileSync(
    outputFilename,
    JSON.stringify(this.contents, null, this.options.indent)
  );
};

module.exports = Plugin;
