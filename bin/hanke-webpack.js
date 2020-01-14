#! D:/node/install/node.exe   
//这里对应着自己node的下载地方
/* 1、需要找到当前执行配置的项目路径，拿到webpack.config.js的配置*/
let path = require('path')

// 导入 config配置文件（即 webpack.config.js）
let config = require(path.resolve('webpack.config.js'))

let Compiler = require('../lib/Compiler')

let compiler = new Compiler(config)

//入口函数
compiler.hooks.entryOption.call()
// 标识运行编译
compiler.run()