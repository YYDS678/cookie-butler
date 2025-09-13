// 全局变量
let currentPlatform = 'quark';
let currentSessionKey = null;
let pollInterval = null;
let timeoutTimer = null;

// 平台Cookie缓存 - 内存中临时存储
let platformCookies = {
    '115': '',
    'quark': '',
    'ali': '',
    'uc': '',
    'baidu': ''
};

// DOM元素
const qrcodeImg = document.getElementById('qrcode');
const qrcodeOverlay = document.getElementById('qrcode-overlay');
const cookieResult = document.getElementById('cookie-result');
const statusMessage = document.getElementById('status-message');
const scanBtns = document.querySelectorAll('.btn-scan');

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

// 初始化页面
function initializePage() {
    // 加载本地缓存的Cookie
    loadLocalCookies();

    // 绑定平台切换事件
    scanBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const platform = this.dataset.platform;
            switchPlatform(platform, this);
        });
    });

    // 绑定二维码点击刷新事件
    qrcodeImg.addEventListener('click', () => {
        const activeElement = document.querySelector('.btn-scan.active');
        if (activeElement) {
            refreshQRCode();
        }
    });

    // 初始状态显示提示信息，加载当前平台的cookie
    loadPlatformCookie(currentPlatform);
    updateStatus('点击二维码或平台按钮开始扫码', 'info');
}

// 切换平台
function switchPlatform(platform, clickedBtn) {
    // 清除轮询
    clearPolling();

    // 保存当前平台的cookie到内存缓存
    savePlatformCookie(currentPlatform, cookieResult.value);

    // 更新UI状态
    scanBtns.forEach(btn => btn.classList.remove('active'));
    clickedBtn.classList.add('active');

    // 更新当前平台
    currentPlatform = platform;

    // 加载新平台的cookie
    loadPlatformCookie(platform);

    // 显示失效二维码和提示信息，不自动生成新二维码
    qrcodeImg.src = './shixiao.jpg';
    updateStatus('点击二维码开始扫码', 'info');
}

// 刷新二维码
async function refreshQRCode() {
    try {
        // 清除之前的轮询
        clearPolling();

        // 显示加载状态
        showLoading(true);
        updateStatus('正在生成二维码...', 'info');

        // 请求生成二维码
        console.log(`正在为平台 ${currentPlatform} 生成二维码...`);
        const response = await axios.post('/api/qrcode', {
            platform: currentPlatform
        });

        console.log('二维码生成响应:', response.data);

        if (response.data.success) {
            // 保存会话密钥
            currentSessionKey = response.data.data.sessionKey;
            console.log('会话密钥已保存，长度:', currentSessionKey.length);

            // 显示二维码
            qrcodeImg.src = response.data.data.qrcode;
            showLoading(false);
            updateStatus('请使用手机APP扫码登录', 'info');

            // 开始轮询检查状态
            startPolling();
        } else {
            throw new Error(response.data.message || '生成二维码失败');
        }

    } catch (error) {
        console.error('生成二维码失败:', error);
        showLoading(false);

        // 更详细的错误处理
        let errorMessage = '生成二维码失败';
        if (error.response) {
            // 服务器响应错误
            errorMessage = `服务器错误 (${error.response.status}): ${error.response.data?.message || error.message}`;
        } else if (error.request) {
            // 网络请求失败
            errorMessage = '网络连接失败，请检查网络连接';
        } else {
            // 其他错误
            errorMessage = `请求失败: ${error.message}`;
        }

        updateStatus(errorMessage, 'error');
        qrcodeImg.src = './shixiao.jpg';
    }
}

// 开始轮询检查扫码状态
function startPolling() {
    // 清除之前的轮询
    clearPolling();
    
    // 开始轮询
    pollInterval = setInterval(async () => {
        try {
            console.log(`检查 ${currentPlatform} 平台状态...`);
            const response = await axios.post('/api/check-status', {
                platform: currentPlatform,
                sessionKey: currentSessionKey
            });

            console.log('状态检查响应:', response.data);

            if (response.data.success) {
                const { status, cookie, token } = response.data.data;

                switch(status) {
                    case 'CONFIRMED':
                        clearPolling();
                        const newCookie = cookie || token || '';
                        cookieResult.value = newCookie;

                        // 自动保存到内存缓存和本地存储
                        savePlatformCookie(currentPlatform, newCookie);
                        saveToLocalStorage(currentPlatform, newCookie);

                        updateStatus('扫码成功！Cookie已获取并自动缓存', 'success');
                        qrcodeImg.src = './shixiao.jpg';
                        showToast('扫码成功！Cookie已自动缓存');
                        break;

                    case 'SCANNED':
                        updateStatus('已扫码，请在手机上确认', 'info');
                        break;

                    case 'EXPIRED':
                        clearPolling();
                        updateStatus('二维码已过期，请刷新', 'error');
                        qrcodeImg.src = './shixiao.jpg';
                        break;

                    case 'CANCELED':
                        clearPolling();
                        updateStatus('已取消登录', 'error');
                        qrcodeImg.src = './shixiao.jpg';
                        break;
                        
                    case 'NEW':
                        updateStatus('等待扫码...', 'info');
                        break;
                }
            }
        } catch (error) {
            console.error('检查状态失败:', error);
            clearPolling();

            // 更详细的错误处理
            let errorMessage = '检查状态失败';
            if (error.response) {
                if (error.response.status === 404) {
                    errorMessage = 'API接口未找到，请检查部署配置';
                } else if (error.response.status >= 500) {
                    errorMessage = '服务器内部错误，请稍后重试';
                } else {
                    errorMessage = `状态检查失败 (${error.response.status}): ${error.response.data?.message || error.message}`;
                }
            } else if (error.request) {
                errorMessage = '网络连接失败，请检查网络连接';
            } else {
                errorMessage = `请求失败: ${error.message}`;
            }

            updateStatus(errorMessage, 'error');
        }
    }, 2000);
    
    // 30秒后超时
    timeoutTimer = setTimeout(() => {
        clearPolling();
        updateStatus('二维码已过期，请刷新', 'error');
        qrcodeImg.src = './shixiao.jpg';
    }, 30000);
}

// 清除轮询
function clearPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
    }
}

// 显示/隐藏加载状态
function showLoading(show) {
    if (show) {
        qrcodeOverlay.style.display = 'flex';
    } else {
        qrcodeOverlay.style.display = 'none';
    }
}

// 更新状态消息
function updateStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

// 显示Toast通知
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toast-content');

    if (toast && toastContent) {
        toastContent.textContent = message;
        toast.style.display = 'block';

        // 3秒后隐藏
        setTimeout(() => {
            toast.style.display = 'none';
            toastContent.textContent = '';
        }, 3000);
    }
}

// Cookie管理函数
// 从本地存储加载所有平台的Cookie
function loadLocalCookies() {
    Object.keys(platformCookies).forEach(platform => {
        const stored = localStorage.getItem(`cookie_${platform}`);
        if (stored) {
            try {
                const cookieData = JSON.parse(stored);
                platformCookies[platform] = cookieData.value || '';
            } catch (error) {
                console.error(`加载${platform}缓存失败:`, error);
            }
        }
    });
}

// 保存平台Cookie到内存缓存
function savePlatformCookie(platform, cookieValue) {
    platformCookies[platform] = cookieValue || '';
}

// 加载平台Cookie到输入框
function loadPlatformCookie(platform) {
    cookieResult.value = platformCookies[platform] || '';
}

// 保存到本地存储
function saveToLocalStorage(platform, cookieValue) {
    try {
        const cookieData = {
            platform: platform,
            value: cookieValue,
            timestamp: Date.now(),
            date: new Date().toLocaleString()
        };
        localStorage.setItem(`cookie_${platform}`, JSON.stringify(cookieData));
        console.log(`${platform} Cookie已保存到本地存储`);
    } catch (error) {
        console.error(`保存${platform} Cookie失败:`, error);
    }
}

// 清空当前平台的所有数据
function clearCurrentPlatform() {
    // 清空输入框
    cookieResult.value = '';

    // 清空内存缓存
    savePlatformCookie(currentPlatform, '');

    // 清空本地存储
    localStorage.removeItem(`cookie_${currentPlatform}`);

    // 更新状态
    updateStatus(`${currentPlatform} 平台数据已清空`, 'info');
    showToast(`${currentPlatform} 平台数据已清空`);
}

// 复制到剪贴板 - 使用现代API
async function copyToClipboard() {
    const textArea = document.getElementById("cookie-result");
    if (!textArea.value) {
        showToast('没有可复制的内容');
        return;
    }

    try {
        await navigator.clipboard.writeText(textArea.value);
        showToast("内容已复制到剪切板");
    } catch (err) {
        console.error('复制失败:', err);
        showToast('复制失败，请手动复制');
    }
}


