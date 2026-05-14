// 빌드 시 자동으로 변경됨
var mode = 'production';
var krMode = 'n';

('use strict');

// 다국어 번역 데이터
const translations = {
    ko: {
        preparing: '게임 준비 중...',
        checkingUpdate: '업데이트 확인 중...',
        downloadingUpdate: '업데이트 다운로드 중...',
        startingGame: '게임 시작 중...',
        downloadingGame: '게임 다운로드 중...',
        firstInstall: '인터넷 연결이 필요합니다.',
        downloadFailed: '다운로드 실패. 인터넷 연결을 확인하세요.',
        loadError: '게임 로딩 오류',
        mainBundle: '메인 번들',
        updateBundle: '업데이트 번들',
        downloadComplete: '다운로드 완료!',
        forceUpdateTitle: '업데이트 필요',
        forceUpdateMessage: '새로운 버전이 출시되었습니다.\n원활한 플레이를 위해\n업데이트를 진행해 주세요.',
        forceUpdateButton: '업데이트'
    },
    en: {
        preparing: 'Preparing game...',
        checkingUpdate: 'Checking updates...',
        downloadingUpdate: 'Downloading updates...',
        startingGame: 'Starting game...',
        downloadingGame: 'Downloading game...',
        firstInstall: 'Internet connection required.',
        downloadFailed: 'Download failed. Check your connection.',
        loadError: 'Game loading error',
        mainBundle: 'Main Bundle',
        updateBundle: 'Update Bundle',
        downloadComplete: 'Download Complete!',
        forceUpdateTitle: 'Update Required',
        forceUpdateMessage: 'A new version is available.\nPlease update to continue\nplaying the game.',
        forceUpdateButton: 'Update'
    },
    ja: {
        preparing: 'ゲーム準備中...',
        checkingUpdate: 'アップデート確認中...',
        downloadingUpdate: 'アップデート中...',
        startingGame: 'ゲーム開始中...',
        downloadingGame: 'ダウンロード中...',
        firstInstall: 'インターネット接続が必要です。',
        downloadFailed: 'ダウンロード失敗。接続を確認してください。',
        loadError: 'ゲーム読み込みエラー',
        mainBundle: 'メインバンドル',
        updateBundle: 'アップデートバンドル',
        downloadComplete: 'ダウンロード完了！',
        forceUpdateTitle: 'アップデートが必要です',
        forceUpdateMessage: '新しいバージョンがリリースされました。\nゲームを続けるには\nアップデートしてください。',
        forceUpdateButton: 'アップデート'
    },
    'zh-CN': {
        preparing: '准备游戏中...',
        checkingUpdate: '检查更新中...',
        downloadingUpdate: '下载更新中...',
        startingGame: '启动游戏中...',
        downloadingGame: '下载游戏中...',
        firstInstall: '需要网络连接。',
        downloadFailed: '下载失败。请检查网络连接。',
        loadError: '游戏加载错误',
        mainBundle: '主程序包',
        updateBundle: '更新包',
        downloadComplete: '下载完成！',
        forceUpdateTitle: '需要更新',
        forceUpdateMessage: '新版本已发布。\n请更新以继续\n游戏。',
        forceUpdateButton: '更新'
    },
    'zh-TW': {
        preparing: '準備遊戲中...',
        checkingUpdate: '檢查更新中...',
        downloadingUpdate: '下載更新中...',
        startingGame: '啟動遊戲中...',
        downloadingGame: '下載遊戲中...',
        firstInstall: '需要網路連線。',
        downloadFailed: '下載失敗。請檢查網路連線。',
        loadError: '遊戲載入錯誤',
        mainBundle: '主程式包',
        updateBundle: '更新包',
        downloadComplete: '下載完成！',
        forceUpdateTitle: '需要更新',
        forceUpdateMessage: '新版本已發佈。\n請更新以繼續\n遊戲。',
        forceUpdateButton: '更新'
    }
};

function getCurrentLanguage() {
    let lang = navigator.language || navigator.userLanguage || 'en';
    lang = lang.toLowerCase();
    if (lang.startsWith('zh')) {
        if (lang.includes('tw') || lang.includes('hant') || lang.includes('hk')) {
            return 'zh-TW';
        }
        return 'zh-CN';
    }
    lang = lang.substring(0, 2);
    if (translations[lang]) return lang;
    return 'en';
}

function getTranslation(key) {
    const lang = getCurrentLanguage();
    return translations[lang][key] || translations['en'][key] || key;
}

class ElfDefenderGameLoader {
    constructor() {
        console.log('----- ElfDefenderGameLoader, constructor() -----');

        this.isLoading = false;
        this.extractedPath = null;

        mode = mode.toLowerCase();
        window.targetMode = mode;
        window.krMode = krMode;

        // 앱에 포함된 번들 버전 (스토어 심사 시 갱신)
        this.APP_BUNDLE_VERSION = '1.5.5';
        window.appBundleVersion = this.APP_BUNDLE_VERSION;

        this.LOCAL_MAIN_VERSION_KEY = 'gameMainBundleVersion';
        this.LOCAL_SUB_VERSION_KEY = 'gameSubBundleVersion';

        console.log('mode:', mode);
        console.log('APP_BUNDLE_VERSION:', this.APP_BUNDLE_VERSION);
    }

    getModeString(value) {
        if (value === 'development' || value === 'dev') return 'dev';
        if (value === 'review' || value === 'stage') return 'stage';
        return 'live';
    }

    async init() {
        console.log('----- init() -----');
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            console.log('ElfDefender 로더 시작');

            // review(stage) vs production 구분
            // if (mode !== 'development') {
            if (mode.startsWith('dev') == false) {
                if (navigator.onLine) {
                    try {
                        const versionInfo = await this.getVersionInfo();
                        window.appMinVersion = versionInfo.appMinVersion;
                        window.appNotiVersion = versionInfo.appNotiVersion;

                        const platform = window.Capacitor.getPlatform();
                        const isKR = krMode === 'y';

                        // 플랫폼/지역별 버전 정보 가져오기
                        let platformInfo;
                        if (isKR && versionInfo.kr) {
                            platformInfo = platform === 'ios' ? versionInfo.kr.ios : versionInfo.kr.android;
                        }
                        if (!platformInfo) {
                            platformInfo = platform === 'ios' ? versionInfo.ios : versionInfo.android;
                        }

                        // 강제 업데이트 체크
                        const appMinVersion = (platformInfo && platformInfo.appMinVersion) || versionInfo.appMinVersion;
                        if (appMinVersion && this.needsUpdate(this.APP_BUNDLE_VERSION, appMinVersion)) {
                            console.log('강제 업데이트 필요: 앱 버전', this.APP_BUNDLE_VERSION, '< 최소 버전', appMinVersion);
                            this.showForceUpdate();
                            return;
                        }

                        let bundleMaxVersion = '0.0.1';
                        if (platformInfo && platformInfo.bundleMaxVersion) {
                            bundleMaxVersion = platformInfo.bundleMaxVersion;
                        }

                        if (this.needsUpdate(bundleMaxVersion, this.APP_BUNDLE_VERSION)) {
                            console.log('---> review(stage) server');
                            mode = 'review';
                            window.targetMode = mode;
                        }
                    } catch (e) {
                        console.warn('버전 정보 조회 실패:', e.message);
                    }
                }
            }

            // 서버 번들 정보 URL (slime-checkinfo 버킷, ef2_{env} 폴더)
            let _mode = this.getModeString(mode);
            this.SERVER_BUNDLE_INFO_URL = `https://slime-checkinfo.s3.us-east-1.amazonaws.com/ef2_${_mode}/bundle.json`;
            console.log('SERVER_BUNDLE_INFO_URL:', this.SERVER_BUNDLE_INFO_URL);

            // 다운로드 진행률 이벤트 리스너 등록
            this.setupDownloadProgressListener();

            // 버전 체크 및 게임 번들 준비
            await this.checkAndPrepareGameBundle();

            // 게임 번들 로드
            window.updateSplashStatus && window.updateSplashStatus(getTranslation('startingGame'));
            await this.loadGameBundle();

            // 게임 시작
            await this.startGame();

            // 스플래시 화면 숨기기
            window.hideSplashScreen && window.hideSplashScreen();

        } catch (error) {
            console.error('로더 에러:', error);
            this.showError(getTranslation('loadError'));
        } finally {
            this.isLoading = false;
        }
    }

    async checkAndPrepareGameBundle() {
        console.log('----- checkAndPrepareGameBundle() -----');

        try {
            // 1. 로컬 버전 확인
            const { mainVersion: localMainVersion, subVersion: localSubVersion } = this.getLocalVersions();
            console.log('로컬 버전 - 메인:', localMainVersion, '서브:', localSubVersion);

            window.appBundleLocalMainVersion = localMainVersion;
            window.appBundleLocalSubVersion = localSubVersion;

            // 2. 첫 설치 체크
            if (!localMainVersion || !localSubVersion) {
                console.log('첫 설치 감지 - 앱에서 게임 번들 추출');
                window.updateSplashStatus && window.updateSplashStatus(getTranslation('preparing'));
                await this.unzipGameBundle();
                this.setLocalVersions(this.APP_BUNDLE_VERSION, this.APP_BUNDLE_VERSION);

                // 온라인인 경우 업데이트 체크
                if (navigator.onLine) {
                    try {
                        window.updateSplashStatus && window.updateSplashStatus(getTranslation('checkingUpdate'));
                        const serverInfo = await this.getServerBundleVersionInfo();
                        console.log('서버 버전 정보:', JSON.stringify(serverInfo));

                        if (this.needsUpdate(this.APP_BUNDLE_VERSION, serverInfo.mainVersion)) {
                            console.log('메인 버전 업데이트 필요');
                            window.updateSplashStatus && window.updateSplashStatus(getTranslation('downloadingUpdate'));
                            await this.downloadMainBundle(serverInfo);

                            if (this.needsUpdate(serverInfo.mainVersion, serverInfo.updateVersion)) {
                                await this.downloadUpdateBundle(serverInfo);
                            }
                            this.setLocalVersions(serverInfo.mainVersion, serverInfo.updateVersion);
                        } else if (this.needsUpdate(this.APP_BUNDLE_VERSION, serverInfo.updateVersion)) {
                            console.log('서브 버전 업데이트 필요');
                            window.updateSplashStatus && window.updateSplashStatus(getTranslation('downloadingUpdate'));
                            await this.downloadUpdateBundle(serverInfo);
                            this.setLocalVersions(this.APP_BUNDLE_VERSION, serverInfo.updateVersion);
                        }
                    } catch (error) {
                        console.warn('서버 업데이트 체크 실패:', error.message);
                    }
                }
                return;
            }

            // 바이너리 업데이트 체크 (스토어 심사 후 앱 업데이트)
            let mainUpdateNeeded = this.needsUpdate(localMainVersion, this.APP_BUNDLE_VERSION);

            // 2026-04-28
            // 만약, APP_BUNDLE_VERSION 보다 localSubVersion 이 더 크면
            // -> 메인 번들 업데이트 무시
            if (this.needsUpdate(this.APP_BUNDLE_VERSION, localSubVersion) == true) {
                mainUpdateNeeded = false;
            }

            let subUpdateNeeded = this.needsUpdate(localSubVersion, this.APP_BUNDLE_VERSION);

            if (mainUpdateNeeded || subUpdateNeeded) {
                window.updateSplashStatus && window.updateSplashStatus(getTranslation('preparing'));
                await this.unzipGameBundle();

                if (mainUpdateNeeded && subUpdateNeeded) {
                    this.setLocalVersions(this.APP_BUNDLE_VERSION, this.APP_BUNDLE_VERSION);
                } else if (mainUpdateNeeded) {
                    this.setLocalVersions(this.APP_BUNDLE_VERSION, localSubVersion);
                } else {
                    this.setLocalVersions(localMainVersion, this.APP_BUNDLE_VERSION);
                }
            }

            // 3. extractedPath 미리 설정 (서버 업데이트 후 return하는 경로 대비)
            if (!this.extractedPath) {
                const { ZipPlugin } = window.Capacitor.Plugins;
                const testResult = await ZipPlugin.test();
                this.extractedPath = testResult.filesDir + '/extracted-game';
                console.log('extractedPath 사전 설정:', this.extractedPath);
            }

            // 4. 서버 버전 체크 (네트워크 연결시에만)
            if (navigator.onLine) {
                try {
                    window.updateSplashStatus && window.updateSplashStatus(getTranslation('checkingUpdate'));
                    const serverInfo = await this.getServerBundleVersionInfo();
                    console.log('서버 버전 정보:', JSON.stringify(serverInfo));

                    if (this.needsUpdate(localMainVersion, serverInfo.mainVersion)) {
                        console.log('메인 버전 업데이트 필요 - 전체 번들 다운로드');
                        window.updateSplashStatus && window.updateSplashStatus(getTranslation('downloadingUpdate'));
                        await this.downloadMainBundle(serverInfo);

                        if (this.needsUpdate(serverInfo.mainVersion, serverInfo.updateVersion)) {
                            await this.downloadUpdateBundle(serverInfo);
                        }
                        this.setLocalVersions(serverInfo.mainVersion, serverInfo.updateVersion);
                        return;
                    }

                    if (this.needsUpdate(localSubVersion, serverInfo.updateVersion)) {
                        console.log('서브 버전 업데이트 필요 - 업데이트 번들만 다운로드');
                        window.updateSplashStatus && window.updateSplashStatus(getTranslation('downloadingUpdate'));
                        await this.downloadUpdateBundle(serverInfo);
                        this.setLocalVersions(localMainVersion, serverInfo.updateVersion);
                        return;
                    }

                    console.log('업데이트 불필요 - 최신 버전');
                } catch (error) {
                    console.warn('서버 버전 체크 실패:', error.message);
                }
            }

            // 5. 기존 로컬 파일 사용
            console.log('기존 로컬 번들 사용, extractedPath:', this.extractedPath);

        } catch (error) {
            console.error('번들 준비 실패:', error);
            this.showError(getTranslation('loadError'));
            throw error;
        }
    }

    getLocalVersions() {
        try {
            const mainVersion = localStorage.getItem(this.LOCAL_MAIN_VERSION_KEY);
            const subVersion = localStorage.getItem(this.LOCAL_SUB_VERSION_KEY);
            return { mainVersion, subVersion };
        } catch (error) {
            console.warn('로컬 버전 조회 실패:', error);
            return { mainVersion: null, subVersion: null };
        }
    }

    setLocalVersions(mainVersion, subVersion) {
        try {
            localStorage.setItem(this.LOCAL_MAIN_VERSION_KEY, mainVersion);
            localStorage.setItem(this.LOCAL_SUB_VERSION_KEY, subVersion);
            console.log('로컬 버전 저장 - 메인:', mainVersion, '서브:', subVersion);
            window.appBundleLocalMainVersion = mainVersion;
            window.appBundleLocalSubVersion = subVersion;
        } catch (error) {
            console.warn('로컬 버전 저장 실패:', error);
        }
    }

    async getServerBundleVersionInfo() {
        console.log('----- getServerBundleVersionInfo() -----');

        const { CapacitorHttp } = window.Capacitor.Plugins;
        let url = this.SERVER_BUNDLE_INFO_URL + '?_ts=' + new Date().getTime();

        const response = await CapacitorHttp.request({
            url: url,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }

        const bundleInfo = response.data;
        if (!bundleInfo.mainVersion || !bundleInfo.updateVersion) {
            throw new Error('서버 번들 정보 형식 오류');
        }

        return bundleInfo;
    }

    async getVersionInfo() {
        console.log('----- getVersionInfo() -----');

        const { CapacitorHttp } = window.Capacitor.Plugins;
        let url = 'https://slime-checkinfo.s3.us-east-1.amazonaws.com/ef2_version.json?_ts=' + new Date().getTime();

        const response = await CapacitorHttp.request({
            url: url,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (response.status !== 200) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }

        return response.data;
    }

    needsUpdate(localVersion, serverVersion) {
        console.log(`버전 비교: 로컬(${localVersion}) vs 서버(${serverVersion})`);

        const parseVersion = version => {
            return version.split('.').map(num => parseInt(num, 10));
        };

        const local = parseVersion(localVersion);
        const server = parseVersion(serverVersion);

        for (let i = 0; i < Math.max(local.length, server.length); i++) {
            const localNum = local[i] || 0;
            const serverNum = server[i] || 0;
            if (serverNum > localNum) return true;
            if (serverNum < localNum) return false;
        }

        return false;
    }

    async downloadMainBundle(serverInfo) {
        console.log('----- downloadMainBundle() -----');

        try {
            const { ZipPlugin } = window.Capacitor.Plugins;

            if (window.showDownloadProgress) {
                window.showDownloadProgress('mainBundle.zip', serverInfo.mainBundle.size || 0, 'main');
            }

            let _mode = this.getModeString(mode);
            const result = await ZipPlugin.downloadAndUnzip({
                url: `${serverInfo.baseUrl}/${_mode}/${serverInfo.mainBundle.fileName}`
            });

            this.extractedPath = result.extractPath;
            console.log('메인 번들 다운로드 완료:', result.extractPath);

            if (window.updateDownloadComplete) {
                window.updateDownloadComplete('mainBundle.zip', serverInfo.mainBundle.size || 0);
            }
        } catch (error) {
            throw new Error(`메인 번들 다운로드 실패: ${error.message}`);
        }
    }

    async downloadUpdateBundle(serverInfo) {
        console.log('----- downloadUpdateBundle() -----');

        try {
            const { ZipPlugin } = window.Capacitor.Plugins;

            if (window.showDownloadProgress) {
                window.showDownloadProgress('updateBundle.zip', serverInfo.updateBundle.size || 0, 'update');
            }

            let _mode = this.getModeString(mode);
            const result = await ZipPlugin.downloadAndUnzip({
                url: `${serverInfo.baseUrl}/${_mode}/${serverInfo.updateBundle.fileName}`
            });

            console.log('업데이트 번들 적용 완료:', result.extractPath);

            if (window.updateDownloadComplete) {
                window.updateDownloadComplete('updateBundle.zip', serverInfo.updateBundle.size || 0);
            }
        } catch (error) {
            throw new Error(`업데이트 번들 다운로드 실패: ${error.message}`);
        }
    }

    async unzipGameBundle() {
        console.log('----- unzipGameBundle() -----');

        try {
            const result = await window.Capacitor.Plugins.ZipPlugin.unzipFromAssets();
            this.extractedPath = result.extractPath;
            console.log('압축 해제 완료:', this.extractedPath);
        } catch (error) {
            throw new Error(`압축 해제 실패: ${error.message}`);
        }
    }

    async loadGameBundle() {
        console.log('----- loadGameBundle() -----');
        console.log('extractedPath:', this.extractedPath);

        // extractedPath가 절대경로인 경우 convertFileSrc로 직접 변환
        const basePath = this.extractedPath;
        const baseUrl = window.Capacitor.convertFileSrc(basePath);
        window.gameBaseUrl = baseUrl;
        console.log('baseUrl:', baseUrl);

        // 1. game-manifest.json 읽기
        let manifest;
        try {
            const manifestUrl = `${baseUrl}/game-manifest.json`;
            console.log('매니페스트 URL:', manifestUrl);
            const response = await fetch(manifestUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            manifest = await response.json();
            console.log('게임 매니페스트:', JSON.stringify(manifest));
        } catch (error) {
            console.error('매니페스트 읽기 실패:', error);
            throw new Error('game-manifest.json 읽기 실패');
        }

        // 2. CSS 파일 로드
        if (manifest.css && manifest.css.length > 0) {
            for (const cssFile of manifest.css) {
                await this.loadCSSFile(cssFile, baseUrl);
            }
        }

        // 3. JS 엔트리 파일 로드
        await this.loadJSFile(manifest.entry, baseUrl);

        console.log('게임 번들 로딩 완료');
    }

    async loadCSSFile(cssPath, baseUrl) {
        const convertedUrl = `${baseUrl}/${cssPath}`;
        console.log('CSS 로드:', convertedUrl);

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = convertedUrl;
            link.onload = () => {
                console.log('CSS 로드 완료:', cssPath);
                resolve();
            };
            link.onerror = (error) => {
                console.error('CSS 로드 실패:', cssPath, error);
                reject(new Error(`${cssPath} 로드 실패`));
            };
            document.head.appendChild(link);
        });
    }

    async loadJSFile(jsPath, baseUrl) {
        const convertedUrl = `${baseUrl}/${jsPath}`;
        console.log('JS 로드:', convertedUrl);

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = convertedUrl;
            script.onload = () => {
                console.log('JS 로드 완료:', jsPath);
                resolve();
            };
            script.onerror = (error) => {
                console.error('JS 로드 실패:', jsPath, error);
                reject(new Error(`${jsPath} 로드 실패`));
            };
            document.head.appendChild(script);
        });
    }

    async startGame() {
        console.log('----- startGame() -----');

        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            if (window.startElfDefenderGame) {
                console.log('게임 시작!');
                await window.startElfDefenderGame();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        throw new Error('게임 시작 함수를 찾을 수 없음 (시간 초과)');
    }

    showForceUpdate() {
        const platform = window.Capacitor.getPlatform();
        const isKR = krMode === 'y';

        // 스토어 URL (플랫폼 + 지역별)
        // TODO: 실제 스토어 등록 후 ID 교체
        const storeUrls = {
            ios_kr: 'https://apps.apple.com/kr/app/id6760745556',
            ios_global: 'https://apps.apple.com/app/id6761818626',
            android_kr: 'https://play.google.com/store/apps/details?id=com.ekkorr.ef2',
            android_global: 'https://play.google.com/store/apps/details?id=com.ekkorr.ef2.gb',
        };
        const key = `${platform}_${isKR ? 'kr' : 'global'}`;
        const storeUrl = storeUrls[key] || storeUrls['android_global'];

        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.innerHTML = `
                <div style="margin-top: 20px;">
                    <div style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">
                        ${getTranslation('forceUpdateTitle')}
                    </div>
                    <div style="font-size: 14px; line-height: 1.6; white-space: pre-line; margin-bottom: 24px;">
                        ${getTranslation('forceUpdateMessage')}
                    </div>
                    <a href="${storeUrl}" style="
                        display: inline-block;
                        background: linear-gradient(90deg, #4ecdc4, #44a08d);
                        color: white;
                        padding: 14px 48px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        text-decoration: none;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                    ">${getTranslation('forceUpdateButton')}</a>
                </div>
            `;
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #ff4444; color: white; padding: 20px; border-radius: 8px;
            font-family: Arial, sans-serif; text-align: center; z-index: 9999;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }

    setupDownloadProgressListener() {
        const { ZipPlugin } = window.Capacitor.Plugins;

        if (ZipPlugin && ZipPlugin.addListener) {
            ZipPlugin.addListener('downloadProgress', progress => {
                console.log(`다운로드 진행: ${progress.percent}%`);
                if (window.updateDownloadProgress) {
                    window.updateDownloadProgress(progress);
                }
            });
            console.log('다운로드 진행률 리스너 등록 완료');
        }
    }
}

// 자동 실행
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM 로드 완료, 게임 로더 시작');

    // Capacitor 준비 대기
    let capacitorReady = false;
    let attempts = 0;

    // Capacitor 준비 대기
    while (!window.Capacitor && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.Capacitor) {
        console.error('Capacitor를 찾을 수 없습니다');
        return;
    }

    // Capacitor 8: 커스텀 네이티브 플러그인 JS 측 등록
    if (window.Capacitor.registerPlugin && !window.Capacitor.Plugins.ZipPlugin) {
        console.log('ZipPlugin JS 프록시 등록');
        window.Capacitor.registerPlugin('ZipPlugin');
    }

    // ZipPlugin 준비 대기
    attempts = 0;
    while (!capacitorReady && attempts < 100) {
        if (window.Capacitor.Plugins && window.Capacitor.Plugins.ZipPlugin) {
            console.log('ZipPlugin 발견!');
            capacitorReady = true;
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts % 10 === 0) {
            console.log(`ZipPlugin 대기 중... (${attempts}/100)`);
        }
    }

    if (!capacitorReady) {
        console.error('ZipPlugin을 찾을 수 없습니다');
        if (window.Capacitor.Plugins) {
            console.error('사용 가능한 플러그인:', Object.keys(window.Capacitor.Plugins));
        }
        return;
    }

    const loader = new ElfDefenderGameLoader();
    await loader.init();
});
