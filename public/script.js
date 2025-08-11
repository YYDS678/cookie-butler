// =================================================================================
// 配置中心
// =================================================================================
const PLATFORM_CONFIG = [
    { id: 'quark', name: '夸克', default: true },
    { id: 'uc',    name: 'UC' },
    { id: 'ali',   name: '阿里' },
    { id: '115',   name: '115' },
];
const DEFAULT_PLATFORM = PLATFORM_CONFIG.find(p => p.default) || PLATFORM_CONFIG[0];

// =================================================================================
// 全局变量
// =================================================================================
let currentPlatform = null;
let currentSessionKey = null;
let pollInterval = null;
let timeoutTimer = null;
const platformCookies = Object.fromEntries(PLATFORM_CONFIG.map(p => [p.id, '']));

// =================================================================================
// DOM元素
// =================================================================================
const qrcodeImg = document.getElementById('qrcode');
const qrcodeOverlay = document.getElementById('qrcode-overlay');
const cookieResult = document.getElementById('cookie-result');
const statusMessage = document.getElementById('status-message');
const platformMenu = document.getElementById('platform-menu');
let scanBtns = [];

// =================================================================================
// 初始化流程
// =================================================================================
document.addEventListener('DOMContentLoaded', function () {
    initializeUI();
    loadLocalCookies();
    
    // 绑定静态和动态事件
    qrcodeImg.addEventListener('click', refreshQRCode);
    window.addEventListener('popstate', route); // 监听浏览器前进/后退
    document.body.addEventListener('click', handleGlobalClick); // 拦截应用内链接点击

    // 初始路由处理
    route();
});

// =================================================================================
// 核心功能 - 路由与导航
// =================================================================================

/**
 * 全局路由处理器
 */
function route() {
    // 从URL路径中提取平台ID，例如从 "/quark" 提取 "quark"
    let platformId = window.location.pathname.substring(1);

    const platformExists = PLATFORM_CONFIG.some(p => p.id === platformId);

    if (!platformExists) {
        platformId = DEFAULT_PLATFORM.id;
        // 使用 history.replaceState 更新URL，避免在历史记录中留下无效或错误的条目
        history.replaceState(null, '', `/${platformId}`);
    }

    const tabElement = document.getElementById(`${platformId}-tab`);
    if (tabElement) {
        switchPlatform(platformId, tabElement);
    }
}

/**
 * 拦截所有点击事件，处理应用内导航
 * @param {Event} e - 点击事件对象
 */
function handleGlobalClick(e) {
    // 寻找被点击的<a>元素或其父元素中的<a>
    const anchor = e.target.closest('a');

    // 检查是否是有效的应用内链接
    if (anchor && anchor.matches('.btn-scan')) {
        e.preventDefault(); // 阻止默认的页面跳转行为
        const targetPath = anchor.getAttribute('href');

        // 如果目标路径与当前路径不同，则更新历史记录并手动触发路由
        if (window.location.pathname !== targetPath) {
            history.pushState(null, '', targetPath);
            route();
        }
    }
}

/**
 * 切换平台的核心逻辑
 */
function switchPlatform(platform, clickedBtn) {
    if (currentPlatform === platform) return;

    clearPolling();

    if (currentPlatform) {
        savePlatformCookie(currentPlatform, cookieResult.value);
    }

    scanBtns.forEach(btn => btn.classList.remove('active'));
    clickedBtn.classList.add('active');

    currentPlatform = platform;
    loadPlatformCookie(platform);

    // 自动刷新二维码
    refreshQRCode();
}

/**
 * 根据配置动态生成平台切换按钮
 */
function initializeUI() {
    platformMenu.innerHTML = '';
    PLATFORM_CONFIG.forEach(platform => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.id = `${platform.id}-tab`;
        // 使用History模式的路径
        a.href = `/${platform.id}`;
        a.className = 'btn-scan';
        a.dataset.platform = platform.id;
        a.textContent = platform.name;
        li.appendChild(a);
        platformMenu.appendChild(li);
    });
    scanBtns = document.querySelectorAll('.btn-scan');
}

// =================================================================================
// 核心功能 - 二维码与状态轮询 (与之前版本基本相同)
// =================================================================================

async function refreshQRCode() {
    if (!currentPlatform) return;
    try {
        clearPolling();
        showLoading(true);
        updateStatus('正在生成二维码...', 'info');
        const response = await axios.post('/api/qrcode', { platform: currentPlatform });
        if (response.data.success) {
            currentSessionKey = response.data.data.sessionKey;
            qrcodeImg.src = response.data.data.qrcode;
            showLoading(false);
            updateStatus('请使用手机APP扫码登录', 'info');
            startPolling();
        } else {
            throw new Error(response.data.message || '生成二维码失败');
        }
    } catch (error) {
        console.error('生成二维码失败:', error);
        showLoading(false);
        const errorMessage = formatErrorMessage(error, '生成二维码失败');
        updateStatus(errorMessage, 'error');
        qrcodeImg.src = './shixiao.jpg';
    }
}

function startPolling() {
    clearPolling();

    const poller = async () => {
        // 捕获当前请求的会话密钥，确保请求和响应是对应的
        const keyForThisRequest = currentSessionKey;
        if (!keyForThisRequest) return; // 如果没有会话,则不执行

        try {
            const response = await axios.post('/api/check-status', {
                platform: currentPlatform,
                sessionKey: keyForThisRequest
            });

            // 如果会话密钥已变，说明是旧响应，忽略
            if (keyForThisRequest !== currentSessionKey) {
                console.log('Ignoring response from an old session.');
                return;
            }
            
            handleStatusResponse(response.data.data);

        } catch (error) {
            // 如果会话密钥已变，说明是旧会话的错误，忽略
            if (keyForThisRequest !== currentSessionKey) {
                console.log('Ignoring error from an old session.');
                return;
            }
            console.error('检查状态失败:', error);
            clearPolling(); // 出错时停止轮询
            const errorMessage = formatErrorMessage(error, '检查状态失败');
            updateStatus(errorMessage, 'error');
        }

        // 关键改动: 只有在轮询未被停止的情况下，才在2秒后安排下一次轮询
        // handleStatusResponse 或 catch 中的 clearPolling() 会将 pollInterval 设为 null
        if (pollInterval) {
            pollInterval = setTimeout(poller, 2000);
        }
    };

    // 设置一个初始值以启动轮询循环
    pollInterval = 'active'; 
    poller(); // 立即开始第一次轮询

    // 30秒后超时的逻辑保持不变
    timeoutTimer = setTimeout(() => {
        clearPolling();
        updateStatus('二维码已过期，请刷新', 'error');
        qrcodeImg.src = './shixiao.jpg';
    }, 30000);
}

function handleStatusResponse({ status, cookie, token }) {
    switch (status) {
        case 'CONFIRMED':
            clearPolling();
            const newCookie = cookie || token || '';
            cookieResult.value = newCookie;
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
        case 'CANCELED':
            clearPolling();
            updateStatus(status === 'EXPIRED' ? '二维码已过期，请刷新' : '已取消登录', 'error');
            qrcodeImg.src = './shixiao.jpg';
            break;
        case 'NEW':
            updateStatus('等待扫码...', 'info');
            break;
    }
}

function clearPolling() {
    clearInterval(pollInterval);
    clearTimeout(timeoutTimer);
    pollInterval = null;
    timeoutTimer = null;
}

// =================================================================================
// UI及辅助函数 (与之前版本基本相同)
// =================================================================================

function showLoading(show) {
    qrcodeOverlay.style.display = show ? 'flex' : 'none';
}

function updateStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toast-content');
    if (toast && toastContent) {
        toastContent.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

function formatErrorMessage(error, defaultMessage) {
    if (error.response) return `服务器错误 (${error.response.status}): ${error.response.data?.message || error.message}`;
    if (error.request) return '网络连接失败，请检查网络或API服务';
    return error.message || defaultMessage;
}

// =================================================================================
// 数据持久化与管理 (与之前版本基本相同)
// =================================================================================

function loadLocalCookies() {
    PLATFORM_CONFIG.forEach(p => {
        const stored = localStorage.getItem(`cookie_${p.id}`);
        if (stored) {
            try {
                platformCookies[p.id] = JSON.parse(stored).value || '';
            } catch (e) {
                console.error(`加载 ${p.id} 缓存失败:`, e);
            }
        }
    });
}

function savePlatformCookie(platform, cookieValue) {
    if (platformCookies.hasOwnProperty(platform)) {
        platformCookies[platform] = cookieValue || '';
    }
}

function loadPlatformCookie(platform) {
    cookieResult.value = platformCookies[platform] || '';
}

function saveToLocalStorage(platform, cookieValue) {
    try {
        const data = { value: cookieValue, timestamp: Date.now() };
        localStorage.setItem(`cookie_${platform}`, JSON.stringify(data));
    } catch (e) {
        console.error(`保存 ${platform} Cookie到本地存储失败:`, e);
    }
}

function clearCurrentPlatform() {
    cookieResult.value = '';
    savePlatformCookie(currentPlatform, '');
    localStorage.removeItem(`cookie_${currentPlatform}`);
    updateStatus(`${currentPlatform.toUpperCase()} 平台数据已清空`, 'info');
    showToast(`${currentPlatform.toUpperCase()} 平台数据已清空`);
}

function copyToClipboard() {
    if (!cookieResult.value) {
        showToast('没有可复制的内容');
        return;
    }
    navigator.clipboard.writeText(cookieResult.value).then(() => {
        showToast("内容已复制到剪切板");
    }).catch(() => {
        showToast('复制失败，请手动复制');
    });
}