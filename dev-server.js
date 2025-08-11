import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS配置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 动态导入API路由处理器
async function loadApiHandler(modulePath) {
    try {
        const module = await import(modulePath);
        return module.default;
    } catch (error) {
        console.error(`加载API模块失败: ${modulePath}`, error);
        return null;
    }
}

// API路由 - 二维码生成
app.post('/api/qrcode', async (req, res) => {
    try {
        const handler = await loadApiHandler('./api/qrcode.js');
        if (handler) {
            await handler(req, res);
        } else {
            res.status(500).json({ success: false, message: '无法加载二维码API' });
        }
    } catch (error) {
        console.error('二维码API错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// API路由 - 状态检查
app.post('/api/check-status', async (req, res) => {
    try {
        const handler = await loadApiHandler('./api/check-status.js');
        if (handler) {
            await handler(req, res);
        } else {
            res.status(500).json({ success: false, message: '无法加载状态检查API' });
        }
    } catch (error) {
        console.error('状态检查API错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// SPA Fallback: 处理所有非API、非静态文件的GET请求，返回index.html
app.get('*', (req, res, next) => {
    // 如果请求路径以/api/开头，则跳过此中间件，让它进入404或错误处理
    if (req.path.startsWith('/api/')) {
        return next();
    }
    // 否则，发送单页应用的入口文件
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('服务器错误:', error);
    res.status(500).json({ 
        success: false, 
        message: '服务器内部错误',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 Cookie Butler 开发服务器启动成功！`);
    console.log(`📱 访问地址: http://localhost:${PORT}`);
    console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
    console.log('');
    console.log('💡 提示:');
    console.log('  - 修改代码后需要重启服务器');
    console.log('  - 推荐使用 "vercel dev" 获得热重载和完整功能');
    console.log('  - 按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务器...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在关闭服务器...');
    process.exit(0);
});
