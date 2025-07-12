import QRCode from 'qrcode';
import {
    httpRequest,
    createSuccessResponse,
    createErrorResponse,
    storage
} from './utils/common.js';

// 平台处理器
const platformHandlers = {
    '115': handle115QRCode,
    'quark': handleQuarkQRCode,
    'ali': handleAliQRCode,
    'uc': handleUCQRCode
};

export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json(createErrorResponse('Method not allowed'));
    }
    
    try {
        const { platform } = req.body;
        console.log(`[QRCode API] 收到请求，平台: ${platform}`);

        if (!platform) {
            console.log('[QRCode API] 错误: 缺少platform参数');
            return res.status(400).json(createErrorResponse('缺少platform参数'));
        }

        const handler = platformHandlers[platform];
        if (!handler) {
            console.log(`[QRCode API] 错误: 不支持的平台 ${platform}`);
            return res.status(400).json(createErrorResponse(`不支持的平台: ${platform}`));
        }

        console.log(`[QRCode API] 开始处理 ${platform} 平台二维码生成`);
        const result = await handler();
        console.log(`[QRCode API] ${platform} 平台二维码生成成功`);
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('[QRCode API] 服务器错误:', error);
        return res.status(500).json(createErrorResponse('服务器内部错误: ' + error.message));
    }
}

// 115网盘二维码处理
async function handle115QRCode() {
    try {
        const response = await httpRequest({
            method: 'GET',
            url: 'https://qrcodeapi.115.com/api/1.0/web/1.0/token',
            headers: {
                'Referer': 'https://115.com/'
            }
        });
        
        const qrData = response.data.data;
        // 使用客户端存储方案 - 将数据编码到sessionKey中
        const sessionData = {
            platform: '115',
            uid: qrData.uid,
            time: qrData.time,
            sign: qrData.sign
        };

        const sessionKey = storage.encode(sessionData);

        // 生成二维码图片
        const qrcodeDataURL = await QRCode.toDataURL(qrData.qrcode, {
            width: 200,
            margin: 1
        });

        return createSuccessResponse({
            qrcode: qrcodeDataURL,
            sessionKey: sessionKey
        });
        
    } catch (error) {
        return createErrorResponse('生成115二维码失败: ' + error.message);
    }
}

// 夸克网盘二维码处理
async function handleQuarkQRCode() {
    try {
        const requestId = generateUUID();
        const response = await httpRequest({
            method: 'GET',
            url: 'https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin',
            params: {
                request_id: requestId,
                client_id: '532',
                v: '1.2'
            }
        });
        
        const token = response.data.data.members.token;
        const qrUrl = `https://su.quark.cn/4_eMHBJ?token=${token}&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=S%3Acustom%7COPT%3ASAREA%400%7COPT%3AIMMERSIVE%401%7COPT%3ABACK_BTN_STYLE%400`;
        
        // 使用客户端存储方案 - 将数据编码到sessionKey中
        const sessionData = {
            platform: 'quark',
            token: token,
            request_id: requestId,
            cookies: response.headers['set-cookie']
        };

        const sessionKey = storage.encode(sessionData);

        // 生成二维码图片
        const qrcodeDataURL = await QRCode.toDataURL(qrUrl, {
            width: 200,
            margin: 1
        });

        return createSuccessResponse({
            qrcode: qrcodeDataURL,
            sessionKey: sessionKey
        });
        
    } catch (error) {
        return createErrorResponse('生成夸克二维码失败: ' + error.message);
    }
}

// 阿里云盘二维码处理
async function handleAliQRCode() {
    try {
        const response = await httpRequest({
            method: 'GET',
            url: 'https://passport.aliyundrive.com/newlogin/qrcode/generate.do',
            params: {
                appName: 'aliyun_drive',
                fromSite: '52',
                appEntrance: 'web',
                isMobile: 'false',
                lang: 'zh_CN',
                returnUrl: '',
                bizParams: '',
                _bx_v: '2.2.3'
            }
        });
        
        const contentData = response.data.content.data;
        // 使用客户端存储方案 - 将数据编码到sessionKey中
        const sessionData = {
            platform: 'ali',
            ck: contentData.ck,
            t: contentData.t
        };

        const sessionKey = storage.encode(sessionData);

        // 生成二维码图片
        const qrcodeDataURL = await QRCode.toDataURL(contentData.codeContent, {
            width: 200,
            margin: 1
        });

        return createSuccessResponse({
            qrcode: qrcodeDataURL,
            sessionKey: sessionKey
        });
        
    } catch (error) {
        return createErrorResponse('生成阿里云盘二维码失败: ' + error.message);
    }
}

// UC网盘二维码处理
async function handleUCQRCode() {
    try {
        const requestId = generateUUID();
        const response = await httpRequest({
            method: 'POST',
            url: 'https://api.open.uc.cn/cas/ajax/getTokenForQrcodeLogin',
            data: {
                v: '1.2',
                request_id: requestId,
                client_id: '381'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const token = response.data.data.members.token;
        const qrUrl = `https://su.uc.cn/1_n0ZCv?token=${token}&client_id=381&uc_param_str=&uc_biz_str=S%3Acustom%7CC%3Atitlebar_fix`;
        
        // 使用客户端存储方案 - 将数据编码到sessionKey中
        const sessionData = {
            platform: 'uc',
            token: token,
            request_id: requestId
        };

        const sessionKey = storage.encode(sessionData);

        // 生成二维码图片
        const qrcodeDataURL = await QRCode.toDataURL(qrUrl, {
            width: 200,
            margin: 1
        });

        return createSuccessResponse({
            qrcode: qrcodeDataURL,
            sessionKey: sessionKey
        });
        
    } catch (error) {
        return createErrorResponse('生成UC二维码失败: ' + error.message);
    }
}


