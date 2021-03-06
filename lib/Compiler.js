const fs = require('fs')
const path = require('path')
const babylon = require('babylon')
const types = require('@babel/types')
//es6模块  需要.defalut
const traverse = require('@babel/traverse').default
const generator = require('@babel/generator').default
//babelon 把源码解析成AST 可在 https://astexplorer.net/ 查看 ast的导出
//@babel/traverse   遍历节点
//@babel/types   节点替换
//@babel/generator 生成

const {SyncHook } = require('tapable')
const ejs = require('ejs')
//引入ejs

class Compiler{
  constructor(config){
    // entry output
    this.config = config
    // 保存文件路径
    this.entryId //'./src/index.js'
    // 保存所有模块依赖
    this.modules = {}
    // 入口路径
    this.entry = config.entry
    //可能输出多个文件
    this.assets = {}
    //表示 工作路径
    this.root = process.cwd()
    
    /* ---------- 与 plugin 相关 ----------*/
    //模拟webpack的生命周期
    this.hooks = {
      entryOption: new SyncHook(),
      compile: new SyncHook(),
      afterCompile: new SyncHook(),
      afterPlugins: new SyncHook(),
      run: new SyncHook(),
      emit: new SyncHook(),
      done: new SyncHook()
    }
    let plugins = this.config.plugins
    //如果是数组
    if(Array.isArray(plugins)){
      plugins.forEach(plugin=>{
        plugin.apply(this)
      })
    }
    this.hooks.afterPlugins.call()
    
  }
  
  // 得到文件内容
  getSource(modulePath) {  
    let content = fs.readFileSync(modulePath,'utf-8')
    //处理 ./index.less
    let rules = this.config.module.rules
    rules.forEach(rule=>{
      let {test,use} = rule
      let len = use.length - 1
      
      /* ---------- 与 loader 相关 ----------*/
      if(test.test(modulePath)){ // 正则匹配这个模块是否需要通过loader来转化
        // loader获取对应的loader函数
        (function normalLoader() {
          //后边是一个绝对路径
          let loader = require(use[len--])
          content = loader(content)
          // 递归调用loader实现转化功能
            if(len>=0){
              normalLoader()
            }
        })()
       
      }
    })
    
    return content
  }
  
  // 解析源码
  parse(source,parentPath) { //主要靠AST解析语法树
    let ast = babylon.parse(source)
    let dependencies =  []//数组依赖
    traverse(ast,{
      // 调用表达式  a执行  require执行
      CallExpression(p){
        let node = p.node //对应的节点
        if(node.callee.name === 'require') {
          node.callee.name = '__webpack_require__'
          let moduleName = node.arguments[0].value // 取到的就是模块的引用名字
          moduleName = moduleName + (path.extname(moduleName)? '':'.js')
          moduleName = './' + path.join(parentPath,moduleName) //'src/a.js'
          dependencies.push(moduleName)
          //节点替换
          node.arguments = [types.StringLiteral(moduleName)]
        }
      }
    })
    let sourceCode = generator(ast).code
    return { sourceCode, dependencies }
  }
  
  // 构建模块
  buildModule(modulePath,isEntry){
    // 获取模块内容
    let source = this.getSource(modulePath)
    // 模块id（即模块的相对路径） moduleName  = modulePath - this.root  // path.relative对应 此方法
    let moduleName = './' + path.relative(this.root,modulePath)
    if(isEntry) {
      this.entryId = moduleName // 保存入口名字
    }
    
    // 解析 需要把source源码进行改造  返回一个依赖列表
    let { sourceCode, dependencies } = this.parse(source, path.dirname(moduleName))
    // 把相对路径和模块中的内容对应起来
    this.modules[moduleName] = sourceCode
    dependencies.forEach(dep=>{
      //附模块的加载  递归加载
      this.buildModule(dep,false)
    })
  }
  emitFile() { //发射文件
    //数据渲染
    //看的是webpack.config.js中的output
    fs.access(this.config.output.path,function(err){
      // 文件和目录不存在的情况下；
      if(err){
        fs.mkdirSync(this.config.output.path);
        // 这里只能创建单层目录，而不能创建多层目录，创建多层目录可看
        // https://blog.csdn.net/m0_37263637/article/details/95640248
      }
    })
    
    let main = path.join(this.config.output.path,this.config.output.filename)
    //读取模板
    let templateStr = this.getSource(path.join(__dirname,'main.ejs'))
    //渲染
    let code = ejs.render(templateStr,{entryId:this.entryId,modules:this.modules})
    //拿到输出到哪个目录下
    //资源中 路径对应的代码
    this.assets[main] = code
    fs.writeFileSync(main,this.assets[main])
  }
  run(){
    /* ---------- 与 plugin 相关 ----------*/
    //执行  解析文件依赖
    this.hooks.run.call()
    //编译 调用
    this.hooks.compile.call()
    /* --------------------*/
    
    //执行  并且创建模块依赖关系  
    this.buildModule(path.resolve(this.root,this.entry),true)
    
    /* ---------- 与 plugin 相关 ----------*/
    // 发射一个文件 打包后的文件
    this.hooks.afterCompile.call()
    this.emitFile()
    this.hooks.emit.call()
    this.hooks.done.call()
  }
}
module.exports = Compiler