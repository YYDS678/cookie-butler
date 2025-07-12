import {
    httpRequest,
    createSuccessResponse,
    createErrorResponse,
    storage,
    STATUS,
    formatCookies
} from './utils/common.js';

// 平台状态检查处理器
const statusHandlers = {
    '115': check115Status,
    'quark': checkQuarkStatus,
    'ali': checkAliStatus,
    'uc': checkUCStatus
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
        const { platform, sessionKey } = req.body;
        console.log(`[Status API] 收到请求，平台: ${platform}, sessionKey长度: ${sessionKey?.length || 0}`);

        if (!platform) {
            console.log('[Status API] 错误: 缺少platform参数');
            return res.status(400).json(createErrorResponse('缺少platform参数'));
        }

        const handler = statusHandlers[platform];
        if (!handler) {
            console.log(`[Status API] 错误: 不支持的平台 ${platform}`);
            return res.status(400).json(createErrorResponse(`不支持的平台: ${platform}`));
        }

        console.log(`[Status API] 开始检查 ${platform} 平台状态`);
        const result = await handler(sessionKey);
        console.log(`[Status API] ${platform} 平台状态检查完成，状态: ${result.data?.status || 'unknown'}`);
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('[Status API] 服务器错误:', error);
        return res.status(500).json(createErrorResponse('服务器内部错误: ' + error.message));
    }
}

// 115网盘状态检查
async function check115Status(sessionKey) {
    try {
        const sessionData = storage.decode(sessionKey);
        if (!sessionData || sessionData.platform !== '115') {
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }

        const { uid, time, sign } = sessionData;
        
        // 检查扫码状态
        const statusResponse = await httpRequest({
            method: 'GET',
            url: `https://qrcodeapi.115.com/get/status/?_=${parseInt(Date.now() / 1000)}&sign=${sign}&time=${time}&uid=${uid}`,
            headers: {
                'Referer': 'https://115.com/'
            }
        });
        
        const statusData = statusResponse.data.data;
        
        if (statusData.status === 2) { // 扫码成功
            // 获取登录cookie
            const loginResponse = await httpRequest({
                method: 'POST',
                url: 'https://passportapi.115.com/app/1.0/android/1.0/login/qrcode',
                data: `account=${uid}&app=android`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://115.com/'
                }
            });
            
            if (loginResponse.data.state === 1) {
                const cookies = formatCookies(loginResponse.headers['set-cookie']);
                // 客户端存储方案中，删除操作由客户端处理

                return createSuccessResponse({
                    status: STATUS.CONFIRMED,
                    cookie: cookies
                });
            } else {
                throw new Error(`登录失败：${loginResponse.data.message}`);
            }
        } else if (statusData.status === 0) {
            return createSuccessResponse({ status: STATUS.NEW });
        } else if (statusData.status === 1) {
            return createSuccessResponse({ status: STATUS.SCANNED });
        } else {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }
        
    } catch (error) {
        return createErrorResponse('检查115状态失败: ' + error.message);
    }
}

// 夸克网盘状态检查
async function checkQuarkStatus(sessionKey) {
    try {
        const sessionData = storage.decode(sessionKey);
        if (!sessionData || sessionData.platform !== 'quark') {
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }

        const { token, request_id } = sessionData;
        
        const response = await httpRequest({
            method: 'GET',
            url: 'https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken',
            params: {
                request_id: request_id,
                client_id: '532',
                v: '1.2',
                token: token
            }
        });
        
        if (response.data.status === 2000000) { // 扫码成功
            const serviceTicket = response.data.data.members.service_ticket;
            
            // 获取cookie
            const cookieResponse = await httpRequest({
                method: 'GET',
                url: 'https://pan.quark.cn/account/info',
                params: {
                    st: serviceTicket,
                    lw: 'scan'
                }
            });
            
            const cookies = formatCookies(cookieResponse.headers['set-cookie']);
            // 客户端存储方案中，删除操作由客户端处理

            return createSuccessResponse({
                status: STATUS.CONFIRMED,
                cookie: cookies
            });
        } else if (response.data.status === 50004002) {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        } else {
            return createSuccessResponse({ status: STATUS.NEW });
        }
        
    } catch (error) {
        return createErrorResponse('检查夸克状态失败: ' + error.message);
    }
}

// 阿里云盘状态检查
async function checkAliStatus(sessionKey) {
    try {
        const sessionData = storage.decode(sessionKey);
        if (!sessionData || sessionData.platform !== 'ali') {
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }

        const { ck, t } = sessionData;
        
        const response = await httpRequest({
            method: 'POST',
            url: 'https://passport.aliyundrive.com/newlogin/qrcode/query.do',
            data: {
                ck: ck,
                t: t,
                appName: 'aliyun_drive',
                appEntrance: 'web',
                isMobile: 'false',
                lang: 'zh_CN',
                returnUrl: '',
                navlanguage: 'zh-CN',
                bizParams: ''
            },
            params: {
                appName: 'aliyun_drive',
                fromSite: '52',
                _bx_v: '2.2.3'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (!response.data.content || !response.data.content.data) {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }

        const status = response.data.content.data.qrCodeStatus;

        if (status === 'CONFIRMED') {
            if (response.data.content.data.bizExt) {
                const bizExt = JSON.parse(atob(response.data.content.data.bizExt));
                const token = bizExt.pds_login_result.refreshToken;

                // 客户端存储方案中，删除操作由客户端处理
                return createSuccessResponse({
                    status: STATUS.CONFIRMED,
                    token: token
                });
            }
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        } else if (status === 'SCANED') {
            return createSuccessResponse({ status: STATUS.SCANNED });
        } else if (status === 'CANCELED') {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.CANCELED });
        } else if (status === 'NEW') {
            return createSuccessResponse({ status: STATUS.NEW });
        } else {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }
        
    } catch (error) {
        return createErrorResponse('检查阿里云盘状态失败: ' + error.message);
    }
}

// UC网盘状态检查
async function checkUCStatus(sessionKey) {
    try {
        const sessionData = storage.decode(sessionKey);
        if (!sessionData || sessionData.platform !== 'uc') {
            return createSuccessResponse({ status: STATUS.EXPIRED });
        }

        const { token, request_id } = sessionData;
        
        const response = await httpRequest({
            method: 'POST',
            url: 'https://api.open.uc.cn/cas/ajax/getServiceTicketByQrcodeToken',
            data: {
                v: '1.2',
                request_id: request_id,
                client_id: '381',
                token: token
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (response.data.status === 2000000) { // 扫码成功
            const serviceTicket = response.data.data.members.service_ticket;
            
            // 获取cookie
            const cookieResponse = await httpRequest({
                method: 'GET',
                url: 'https://drive.uc.cn/account/info',
                params: {
                    st: serviceTicket
                }
            });
            
            const cookies = formatCookies(cookieResponse.headers['set-cookie']);
            // 客户端存储方案中，删除操作由客户端处理

            return createSuccessResponse({
                status: STATUS.CONFIRMED,
                cookie: cookies
            });
        } else if (response.data.status === 50004002) {
            // 客户端存储方案中，删除操作由客户端处理
            return createSuccessResponse({ status: STATUS.EXPIRED });
        } else {
            return createSuccessResponse({ status: STATUS.NEW });
        }
        
    } catch (error) {
        return createErrorResponse('检查UC状态失败: ' + error.message);
    }
}


