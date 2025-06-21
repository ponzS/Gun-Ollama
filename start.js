import server from "./server.js";

// 启动集成了Gun Relay和Ollama API的服务器
server.init();

console.log('\n=== 服务说明 ===');
console.log('Gun Relay: WebSocket实时数据同步');
console.log('Ollama API: 本地AI模型访问');
console.log('统一端口: 8765');
console.log('================\n');

