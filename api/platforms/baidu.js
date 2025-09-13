import { BasePlatform } from './base.js';
import CryptoJS from 'crypto-js';
import { STATUS } from '../utils/common.js';

/**
 * 百度网盘平台实现
 */
export class BaiduPlatform extends BasePlatform {
    constructor() {
        super('baidu');
    }

    /**
     * 生成百度网盘二维码
     * @returns {Promise<Object>} 包含二维码和sessionKey的响应对象
     */
    async generateQRCode() {
        try {
            const requestId = this.generateUUID();
            const t3 = new Date().getTime().toString();
            const t1 = Math.floor(new Date().getTime() / 1000).toString();

            // 构建请求参数
            const params = {
                ...this.getParam('lp') && { lp: this.getParam('lp') },
                ...this.getParam('qrloginfrom') && { qrloginfrom: this.getParam('qrloginfrom') },
                gid: requestId,
                ...this.getParam('apiver') && { apiver: this.getParam('apiver') },
                tt: t3,
                ...this.getParam('tpl') && { tpl: this.getParam('tpl') },
                logPage: `traceId%3Apc_loginv5_${t1}%2ClogPage%3Aloginv5`,
                _: t3
            };

            // 构建请求头
            const headers = {
                'User-Agent': this.getUserAgent(),
                ...this.config.headers
            };

            // 调用百度API获取二维码
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('getQRCode'),
                params,
                headers
            });

            // 兼容不同的响应结构
            const resData = response.data?.data || response.data;
            if (!resData || !resData.imgurl) {
                return this.createErrorResponse('生成二维码失败: 响应数据无效');
            }

            const qrUrl = 'https://' + resData.imgurl;
            const channelId = resData.sign;

            // 创建会话数据
            const sessionKey = this.createSessionKey({
                t1,
                t3,
                channelId,
                requestId
            });

            // 获取二维码图片
            const qrcodeDataURL = await this.fetchQRCodeImage(qrUrl);

            return this.createSuccessResponse({
                qrcode: qrcodeDataURL,
                sessionKey
            });

        } catch (error) {
            console.error('[百度网盘] 生成二维码失败:', error.message);
            return this.createErrorResponse('生成二维码失败: ' + error.message);
        }
    }

    /**
     * 检查百度网盘扫码状态
     * @param {string} sessionKey 会话密钥
     * @returns {Promise<Object>} 状态检查结果
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { t1, t3, channelId, requestId } = sessionData;

            // 构建请求参数
            const params = {
                channel_id: channelId,
                gid: requestId,
                ...this.getParam('tpl') && { tpl: this.getParam('tpl') },
                _sdkFrom: '1',
                ...this.getParam('apiver') && { apiver: this.getParam('apiver') },
                tt: t3,
                _: t3
            };

            // 构建请求头
            const headers = {
                'User-Agent': this.getUserAgent(),
                ...this.config.headers
            };

            // 检查扫码状态
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('checkStatus'),
                params,
                headers
            });

            // 兼容响应结构
            const resData = response.data?.data || response.data;
            if (!resData) {
                return this.createSuccessResponse({ status: STATUS.NEW });
            }

            // 检查是否扫码成功/已扫码待确认
            if (resData.channel_v) {
                const bdData = JSON.parse(resData.channel_v);
                if (bdData.v) {
                    const cookie = await this.getBaiduCookie(bdData.v, t1, t3);
                    return this.createSuccessResponse({ status: STATUS.CONFIRMED, cookie });
                }
                // 部分场景下出现channel_v但尚未返回bduss，判定为已扫码待确认
                return this.createSuccessResponse({ status: STATUS.SCANNED });
            } else if (resData.data) {
                // token过期
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            // 继续等待
            return this.createSuccessResponse({ status: STATUS.NEW });

        } catch (error) {
            console.warn('[百度网盘] 状态检查出现异常，返回NEW防止中断轮询:', error.message);
            return this.createSuccessResponse({ status: STATUS.NEW });
        }
    }

    /**
     * 获取百度完整Cookie
     * @param {string} bduss BDUSS值
     * @param {string} t1 时间戳1
     * @param {string} t3 时间戳3
     * @returns {Promise<string>} 完整的cookie字符串
     */
    async getBaiduCookie(bduss, t1, t3) {
        try {
            // 第一步：通过BDUSS获取详细cookie信息
            const cookieParams = {
                v: t3,
                bduss: bduss,
                u: this.getParam('u'),
                ...this.getParam('loginVersion') && { loginVersion: this.getParam('loginVersion') },
                ...this.getParam('qrcode') && { qrcode: this.getParam('qrcode') },
                ...this.getParam('tpl') && { tpl: this.getParam('tpl') },
                maskId: '',
                fileId: '',
                ...this.getParam('apiver') && { apiver: this.getParam('apiver') },
                tt: t3,
                traceid: '',
                time: t1,
                alg: 'v3',
                elapsed: '1'
            };

            const cookieHeaders = {
                'User-Agent': this.getUserAgent(),
                ...this.config.headers
            };

            const cookieResponse = await this.request({
                method: 'GET',
                url: this.getEndpoint('bdussLogin'),
                params: cookieParams,
                headers: cookieHeaders,
                timeout: 30000
            });

            if (!cookieResponse.data) {
                throw new Error('获取cookie信息失败');
            }

            // 解析cookie数据
            const cookieData = cookieResponse.data?.data || cookieResponse.data;
            const extractedBduss = this.extractValue(cookieData, /"bduss":\s*"(.*?)"/i);
            const stoken = this.extractValue(cookieData, /"stoken":\s*"(.*?)"/i);
            const ptoken = this.extractValue(cookieData, /"ptoken":\s*"(.*?)"/i);
            const ubi = encodeURIComponent(this.extractValue(cookieData, /"ubi":\s*"(.*?)"/i));

            // 仅 BDUSS 必须；STOKEN/PTOKEN 可能在重定向后由 Set-Cookie 设置
            if (!extractedBduss) {
                throw new Error('cookie数据解析失败：缺少BDUSS');
            }

            // 构建cookie对象
            const cookies = {
                'newlogin': '1',
                'UBI': ubi,
                'STOKEN': stoken,
                'BDUSS': extractedBduss,
                'PTOKEN': ptoken,
                'BDUSS_BFESS': extractedBduss,
                'STOKEN_BFESS': stoken,
                'PTOKEN_BFESS': ptoken,
                'UBI_BFESS': ubi
            };

            // 第二步：进行认证获取最终cookie
            const authHeaders = {
                'User-Agent': this.getUserAgent(),
                'Referer': this.getHeader('referer'),
                'Cookie': this.buildCookieString(cookies),
                'Accept': '*/*'
            };

            const authUrl = this.getEndpoint('auth') + `?${this.getParam('return_type') ? 'return_type=' + this.getParam('return_type') : ''}&${this.getParam('tpl') ? 'tpl=' + this.getParam('tpl') : ''}&u=${encodeURIComponent(this.getEndpoint('panHome'))}`;

            const authResponse = await this.request({
                method: 'GET',
                url: authUrl,
                headers: authHeaders,
                maxRedirects: 0,
                timeout: 30000,
                validateStatus: (status) => status < 400
            });

            // 第三步：跟随重定向获取最终cookie
            if (authResponse.headers && authResponse.headers.location) {
                const finalResponse = await this.request({
                    method: 'GET',
                    url: authResponse.headers.location,
                    headers: authHeaders,
                    maxRedirects: 0,
                    timeout: 30000,
                    validateStatus: (status) => status < 400
                });

                if (finalResponse.headers && finalResponse.headers['set-cookie']) {
                    const setCookies = finalResponse.headers['set-cookie'];
                    const stokenCookie = this.extractStokenFromSetCookie(setCookies);
                    if (stokenCookie) {
                        return `BDUSS=${extractedBduss};${stokenCookie};`;
                    }
                }
            }

            // 如果没有获取到最终cookie，尽量返回包含STOKEN_BFESS/STOKEN的构造
            const fallbackStoken = stoken ? `STOKEN=${stoken};` : '';
            return `BDUSS=${extractedBduss};${fallbackStoken}`;

        } catch (error) {
            console.error('[百度网盘] 获取完整cookie失败:', error.message);
            throw new Error(`获取百度网盘cookie失败: ${error.message}`);
        }
    }

    /**
     * 获取二维码图片
     * @param {string} qrUrl 二维码URL
     * @returns {Promise<string>} Base64格式的二维码图片
     */
    async fetchQRCodeImage(qrUrl) {
        try {
            const response = await this.request({
                method: 'GET',
                url: qrUrl,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': this.getUserAgent()
                }
            });

            // 将ArrayBuffer转换为Base64
            const base64 = this.arrayBufferToBase64(response.data);
            return `data:image/png;base64,${base64}`;

        } catch (error) {
            console.error('[百度网盘] 获取二维码图片失败:', error.message);
            throw new Error(`获取二维码图片失败: ${error.message}`);
        }
    }

    /**
     * 生成UUID
     * @returns {string} UUID字符串
     */
    generateUUID() {
        // 使用crypto-js生成随机UUID
        const randomBytes = CryptoJS.lib.WordArray.random(16);
        const hex = randomBytes.toString(CryptoJS.enc.Hex);
        return [
            hex.substring(0, 8),
            hex.substring(8, 12),
            '4' + hex.substring(13, 16),
            ((parseInt(hex.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.substring(17, 20),
            hex.substring(20, 32)
        ].join('-');
    }

    /**
     * ArrayBuffer转Base64
     * @param {ArrayBuffer} buffer ArrayBuffer数据
     * @returns {string} Base64字符串
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * 从字符串中提取值
     * @param {string} text 源字符串
     * @param {RegExp} regex 正则表达式
     * @returns {string} 提取的值
     */
    extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1] : '';
    }

    /**
     * 构建Cookie字符串
     * @param {Object} cookies Cookie对象
     * @returns {string} Cookie字符串
     */
    buildCookieString(cookies) {
        // Cookie 头部不应 URL 编码
        return Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    /**
     * 从Set-Cookie头中提取STOKEN
     * @param {string|Array} setCookies Set-Cookie头
     * @returns {string} STOKEN cookie
     */
    extractStokenFromSetCookie(setCookies) {
        const list = Array.isArray(setCookies)
            ? setCookies
            : (typeof setCookies === 'string' ? [setCookies] : []);

        const pick = (name) => {
            const needle = name.toLowerCase() + '=';
            const hit = list.find(c => typeof c === 'string' && c.toLowerCase().includes(needle));
            return hit ? hit.split(';')[0] : '';
        };

        // 优先使用 STOKEN_BFESS，其次 STOKEN
        return pick('STOKEN_BFESS') || pick('STOKEN') || '';
    }
}
