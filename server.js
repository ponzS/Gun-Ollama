import express from "express";
import Gun from "gun";
import qr from "qrcode-terminal";
import ip from "ip";
import 'dotenv/config'
import setSelfAdjustingInterval from 'self-adjusting-interval';
import cors from "cors";
import { Ollama } from "ollama";
import { networkInterfaces } from "os";

/* global process */

const testPort = (port) => {
  return new Promise((resolve, reject) => {
    const server = express().listen(port, () => {
      server.close(() => resolve(true));
    }).on('error', () => resolve(false));
  });
};

// 获取局域网 IP 地址
function getLocalIPAddress() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 筛选 IPv4 地址，排除回环地址 (127.0.0.1)
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "0.0.0.0"; 
}

export default {
  initiated: false,
  async init(config = {}) {
    if (this.initiated) return;
    this.initiated = true;

    let {
      host = process.env.RELAY_HOST || ip.address(),
      store = process.env.RELAY_STORE || false,
      port = process.env.RELAY_PORT || 8765,
      path = process.env.RELAY_PATH || "public",
      showQr = process.env.RELAY_QR || false
    } = config;

    console.clear();
    console.log('=== GUN-VUE RELAY SERVER WITH OLLAMA API ===\n');

    var app = express();

    // 启用CORS和JSON解析 - 为Ollama API添加
    app.use(cors()); 
    app.use(express.json()); 

    // 错误处理中间件
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: "Internal Server Error" });
    });

    // Ollama实例
    const ollama = new Ollama({ host: "http://localhost:11434" });

    // === OLLAMA API 路由 ===
    
    // 获取可用模型列表
    app.get("/api/models", async (req, res) => {
      try {
        const response = await ollama.list();
        res.json(response.models);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 生成文本（chat completions）
    app.post("/api/chat", async (req, res) => {
      const { model, messages, stream = false, options = {} } = req.body;
      try {
        if (stream) {
          // 流式响应
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          const response = await ollama.chat({
            model,
            messages,
            stream: true,
            options,
          });

          for await (const part of response) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
          }
          res.end();
        } else {
          // 非流式响应
          const response = await ollama.chat({
            model,
            messages,
            options,
          });
          res.json(response);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 生成文本（generate completions）
    app.post("/api/generate", async (req, res) => {
      const { model, prompt, stream = false, options = {} } = req.body;
      try {
        if (stream) {
          // 流式响应
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          const response = await ollama.generate({
            model,
            prompt,
            stream: true,
            options,
          });

          for await (const part of response) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
          }
          res.end();
        } else {
          // 非流式响应
          const response = await ollama.generate({
            model,
            prompt,
            options,
          });
          res.json(response);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 创建模型
    app.post("/api/models/create", async (req, res) => {
      const { name, modelfile, stream = false } = req.body;
      try {
        const response = await ollama.create({
          model: name,
          modelfile,
          stream,
        });
        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          for await (const part of response) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
          }
          res.end();
        } else {
          res.json(response);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 删除模型
    app.delete("/api/models/:name", async (req, res) => {
      const { name } = req.params;
      try {
        await ollama.delete({ model: name });
        res.json({ message: `Model ${name} deleted successfully` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 复制模型
    app.post("/api/models/copy", async (req, res) => {
      const { source, destination } = req.body;
      try {
        await ollama.copy({ source, destination });
        res.json({ message: `Model copied from ${source} to ${destination}` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 显示模型信息
    app.get("/api/models/:name", async (req, res) => {
      const { name } = req.params;
      try {
        const response = await ollama.show({ model: name });
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 拉取模型
    app.post("/api/models/pull", async (req, res) => {
      const { name, stream = false } = req.body;
      try {
        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          const response = await ollama.pull({
            model: name,
            stream: true,
          });

          for await (const part of response) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
          }
          res.end();
        } else {
          const response = await ollama.pull({
            model: name,
          });
          res.json(response);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 推送模型
    app.post("/api/models/push", async (req, res) => {
      const { name, stream = false } = req.body;
      try {
        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          const response = await ollama.push({
            model: name,
            stream: true,
          });

          for await (const part of response) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
          }
          res.end();
        } else {
          const response = await ollama.push({
            model: name,
          });
          res.json(response);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 生成嵌入
    app.post("/api/embeddings", async (req, res) => {
      const { model, prompt } = req.body;
      try {
        const response = await ollama.embeddings({
          model,
          prompt,
        });
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Gun Relay 路由 ===
    
    // Explicit root route handling
    app.get('/', (req, res) => {
      res.sendFile('index.html', { root: path });
    });

    app.use(express.static(path));

    let currentPort = parseInt(port);
    while (!(await testPort(currentPort))) {
      console.log(`Port ${currentPort} in use, trying next...`);
      currentPort++;
    }

    var server = app.listen(currentPort);
    port = currentPort; // Update port for later use

    const gun = Gun({
      super: false,
      file: "store",
      radisk: store,
      web: server,
    });

    const link = "http://" + host + (port ? ":" + port : "");
    const extLink = "https://" + host;
    const localIP = getLocalIPAddress();
    let totalConnections = 0;
    let activeWires = 0;

    const db = gun.get('relays').get(host);

    setSelfAdjustingInterval(() => {
      db.get("pulse").put(Date.now());
    }, 500);

    gun.on("hi", () => {
      totalConnections += 1;
      db.get("totalConnections").put(totalConnections);
      activeWires += 1;
      db.get("activeWires").put(activeWires);
      console.log(`Connection opened (active: ${activeWires})`);
    });

    gun.on("bye", () => {
      activeWires -= 1;
      db.get("activeWires").put(activeWires);
      console.log(`Connection closed (active: ${activeWires})`);
    });

    db.get("host").put(host);
    db.get("port").put(port);
    db.get("link").put(link);
    db.get("ext-ink").put(extLink);
    db.get("store").put(store);
    db.get("status").put("running");
    db.get("started").put(Date.now());

    console.log(`Internal URL: ${link}/`);
    console.log(`External URL: ${extLink}/`);
    console.log(`Gun peer: ${link}/gun`);
    console.log(`Ollama API: ${link}/api/`);
    console.log(`LAN Access: http://${localIP}:${port}/`);
    console.log(`Storage: ${store ? 'enabled' : 'disabled'}`);

    if (showQr != false) {
      console.log('\n=== QR CODE ===');
      qr.generate(link, { small: true });
      console.log('===============\n');
    }

    return { app, db };
  },
};