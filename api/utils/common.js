import axios from 'axios';

// 通用请求头
export const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// 状态常量
export const STATUS = {
    NEW: 'NEW',
    SCANNED: 'SCANNED', 
    CONFIRMED: 'CONFIRMED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED'
};



// 按照CatPawOpen的getCookieArray实现
export const getCookieArray = (cookies) => {
    if (!cookies) return [];
    return cookies.map(cookie => cookie.split(";")[0] + ";");
}

// 格式化Cookie - 基于getCookieArray实现
export function formatCookies(cookies) {
    if (!cookies) return '';

    if (typeof cookies === 'string') {
        return cookies;
    }

    if (Array.isArray(cookies)) {
        return getCookieArray(cookies).join('');
    }

    return '';
}





// HTTP请求封装
export async function httpRequest(config) {
    try {
        const response = await axios({
            timeout: 15000,
            ...config,
            headers: {
                ...COMMON_HEADERS,
                ...config.headers
            }
        });
        return response;
    } catch (error) {
        console.error('HTTP请求失败:', error.message);
        throw error;
    }
}

// 响应封装
export function createResponse(success, data = null, message = '') {
    return {
        success,
        data,
        message,
        timestamp: Date.now()
    };
}

// 错误响应
export function createErrorResponse(message, error = null) {
    console.error('API错误:', message, error);
    return createResponse(false, null, message);
}

// 成功响应
export function createSuccessResponse(data, message = '') {
    return createResponse(true, data, message);
}

// 客户端存储方案 - 将数据编码到sessionKey中
// 这样可以避免serverless环境下的内存存储问题
export const storage = {
    // 编码数据到sessionKey
    encode(data, ttl = 300000) {
        const payload = {
            data: data,
            expireTime: Date.now() + ttl,
            timestamp: Date.now()
        };
        // 使用Base64编码，添加简单的混淆
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
        return encoded.replace(/[+/=]/g, (match) => {
            switch (match) {
                case '+': return '-';
                case '/': return '_';
                case '=': return '';
                default: return match;
            }
        });
    },

    // 从sessionKey解码数据
    decode(sessionKey) {
        try {
            if (!sessionKey) return null;

            // 还原Base64字符
            let base64 = sessionKey.replace(/[-_]/g, (match) => {
                return match === '-' ? '+' : '/';
            });

            // 补充padding
            while (base64.length % 4) {
                base64 += '=';
            }

            const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

            // 检查是否过期
            if (Date.now() > payload.expireTime) {
                return null;
            }

            return payload.data;
        } catch (error) {
            console.error('解码sessionKey失败:', error);
            return null;
        }
    },

    // 兼容性方法
    set(_key, value, ttl = 300000) {
        // 在客户端存储方案中，这个方法返回编码后的key
        return this.encode(value, ttl);
    },

    get(sessionKey) {
        return this.decode(sessionKey);
    },

    delete(_key) {
        // 客户端存储方案中，删除操作由客户端处理
        return true;
    },

    clear() {
        // 客户端存储方案中，清除操作由客户端处理
        return true;
    }
};
