# Cookie Butler

一个多平台二维码Cookie获取工具，支持夸克网盘、UC网盘、阿里云盘、115网盘的扫码登录。

## 🚀 快速开始

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装和运行
```bash
# 1. 安装依赖
npm install

# 2. 启动本地服务器
npm run dev

# 3. 打开浏览器访问
http://localhost:3000
```

## 📁 项目结构

```
cookie-butler/
├── package.json          # 项目配置
├── dev-server.js         # 本地开发服务器
├── api/                  # 后端API
│   ├── qrcode.js        # 二维码生成
│   ├── check-status.js  # 状态检查
│   └── utils/
│       └── common.js    # 通用工具
└── public/              # 前端文件
    ├── index.html       # 主页面
    ├── script.js        # 交互逻辑
    ├── style.css        # 样式文件
    └── shixiao.jpg      # 占位图片
```

---

**版本**: 1.0.0  
**更新时间**: 2025-06-21
