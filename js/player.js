const selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');

// 弹幕 API 配置
const DANMU_API_URL = 'https://danmu.manxue.eu.org/87654321';

// 改进返回功能
function goBack(event) {
    if (event) event.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    if (returnUrl) {
        window.location.href = decodeURIComponent(returnUrl);
        return;
    }
    
    const lastPageUrl = localStorage.getItem('lastPageUrl');
    if (lastPageUrl && lastPageUrl !== window.location.href) {
        window.location.href = lastPageUrl;
        return;
    }
    
    const referrer = document.referrer;
    
    if (referrer && (referrer.includes('/s=') || referrer.includes('?s='))) {
        window.location.href = referrer;
        return;
    }
    
    if (window.self !== window.top) {
        try {
            window.parent.closeVideoPlayer && window.parent.closeVideoPlayer();
            return;
        } catch (e) {
            console.error('调用父窗口closeVideoPlayer失败:', e);
        }
    }
    
    if (!referrer || referrer === '') {
        window.location.href = '/';
        return;
    }
    
    window.history.back();
}

window.addEventListener('load', function () {
    if (document.referrer && document.referrer !== window.location.href) {
        localStorage.setItem('lastPageUrl', document.referrer);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');
    const sourceCode = urlParams.get('source');

    if (videoId && sourceCode) {
        localStorage.setItem('currentPlayingId', videoId);
        localStorage.setItem('currentPlayingSource', sourceCode);
    }
});

// 全局变量
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let art = null;
let currentHls = null;
let currentEpisodes = [];
let episodesReversed = false;
let autoplayEnabled = true;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let adFilteringEnabled = true;
let progressSaveInterval = null;
let currentVideoUrl = '';
let danmakuData = []; // 缓存弹幕数据

// 弹幕配置默认值
const DEFAULT_DANMAKU_CONFIG = {
    speed: 5,
    opacity: 1,
    fontSize: 25,
    color: '#FFFFFF',
    mode: 0,
    margin: [10, '25%'],
    antiOverlap: true,
    useWorker: true,
    synchronousPlayback: false
};

// 从 localStorage 加载弹幕配置
function loadDanmakuConfig() {
    try {
        const saved = localStorage.getItem('danmakuConfig');
        if (saved) {
            const config = JSON.parse(saved);
            return { ...DEFAULT_DANMAKU_CONFIG, ...config };
        }
    } catch (e) {
        console.error('加载弹幕配置失败:', e);
    }
    return { ...DEFAULT_DANMAKU_CONFIG };
}

// 保存弹幕配置
function saveDanmakuConfig(config) {
    try {
        localStorage.setItem('danmakuConfig', JSON.stringify(config));
    } catch (e) {
        console.error('保存弹幕配置失败:', e);
    }
}

const isWebkit = (typeof window.webkitConvertPointFromNodeToPage === 'function')
Artplayer.FULLSCREEN_WEB_IN_BODY = true;

// 页面加载
document.addEventListener('DOMContentLoaded', function () {
    if (!isPasswordVerified()) {
        document.getElementById('player-loading').style.display = 'none';
        return;
    }

    initializePageContent();
});

document.addEventListener('passwordVerified', () => {
    document.getElementById('player-loading').style.display = 'block';
    initializePageContent();
});

// 初始化页面内容
function initializePageContent() {
    const urlParams = new URLSearchParams(window.location.search);
    let videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source');
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes');
    const savedPosition = parseInt(urlParams.get('position') || '0');
    
    if (videoUrl && videoUrl.includes('player.html')) {
        try {
            const nestedUrlParams = new URLSearchParams(videoUrl.split('?')[1]);
            const nestedVideoUrl = nestedUrlParams.get('url');
            const nestedPosition = nestedUrlParams.get('position');
            const nestedIndex = nestedUrlParams.get('index');
            const nestedTitle = nestedUrlParams.get('title');

            if (nestedVideoUrl) {
                videoUrl = nestedVideoUrl;

                const url = new URL(window.location.href);
                if (!urlParams.has('position') && nestedPosition) {
                    url.searchParams.set('position', nestedPosition);
                }
                if (!urlParams.has('index') && nestedIndex) {
                    url.searchParams.set('index', nestedIndex);
                }
                if (!urlParams.has('title') && nestedTitle) {
                    url.searchParams.set('title', nestedTitle);
                }
                window.history.replaceState({}, '', url);
            } else {
                showError('历史记录链接无效，请返回首页重新访问');
            }
        } catch (e) {
        }
    }

    currentVideoUrl = videoUrl || '';
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    currentEpisodeIndex = index;

    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    document.getElementById('autoplayToggle').checked = autoplayEnabled;

    adFilteringEnabled = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false';

    document.getElementById('autoplayToggle').addEventListener('change', function (e) {
        autoplayEnabled = e.target.checked;
        localStorage.setItem('autoplayEnabled', autoplayEnabled);
    });

    try {
        if (episodesList) {
            currentEpisodes = JSON.parse(decodeURIComponent(episodesList));
        } else {
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
        }

        if (index < 0 || (currentEpisodes.length > 0 && index >= currentEpisodes.length)) {
            if (index >= currentEpisodes.length && currentEpisodes.length > 0) {
                index = currentEpisodes.length - 1;
            } else {
                index = 0;
            }

            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl);
        }

        currentEpisodeIndex = index;
        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        currentEpisodes = [];
        currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    document.title = currentVideoTitle + ' - LibreTV播放器';
    document.getElementById('videoTitle').textContent = currentVideoTitle;

    if (videoUrl) {
		// 先预加载弹幕，等待完成后再初始化播放器
		preloadDanmaku()
			.then(() => {
				console.log('首次加载：弹幕预加载完成，弹幕数量:', danmakuData.length);
				initPlayer(videoUrl);
			})
			.catch(e => {
				console.error('预加载弹幕失败:', e);
				// 即使弹幕加载失败也要初始化播放器
				initPlayer(videoUrl);
			});
	} else {
		showError('无效的视频链接');
	}

    renderResourceInfoBar();
    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
    updateOrderButton();

    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000);

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    const waitForVideo = setInterval(() => {
        if (art && art.video) {
            art.video.addEventListener('pause', saveCurrentProgress);

            let lastSave = 0;
            art.video.addEventListener('timeupdate', function() {
                const now = Date.now();
                if (now - lastSave > 5000) {
                    saveCurrentProgress();
                    lastSave = now;
                }
            });

            clearInterval(waitForVideo);
        }
    }, 200);
}

// 处理键盘快捷键
function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.altKey && e.key === 'ArrowLeft') {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('上一集', 'left');
            e.preventDefault();
        }
    }

    if (e.altKey && e.key === 'ArrowRight') {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('下一集', 'right');
            e.preventDefault();
        }
    }

    if (!e.altKey && e.key === 'ArrowLeft') {
        if (art && art.currentTime > 5) {
            art.currentTime -= 5;
            showShortcutHint('快退', 'left');
            e.preventDefault();
        }
    }

    if (!e.altKey && e.key === 'ArrowRight') {
        if (art && art.currentTime < art.duration - 5) {
            art.currentTime += 5;
            showShortcutHint('快进', 'right');
            e.preventDefault();
        }
    }

    if (e.key === 'ArrowUp') {
        if (art && art.volume < 1) {
            art.volume += 0.1;
            showShortcutHint('音量+', 'up');
            e.preventDefault();
        }
    }

    if (e.key === 'ArrowDown') {
        if (art && art.volume > 0) {
            art.volume -= 0.1;
            showShortcutHint('音量-', 'down');
            e.preventDefault();
        }
    }

    if (e.key === ' ') {
        if (art) {
            art.toggle();
            showShortcutHint('播放/暂停', 'play');
            e.preventDefault();
        }
    }

    if (e.key === 'f' || e.key === 'F') {
        if (art) {
            art.fullscreen = !art.fullscreen;
            showShortcutHint('切换全屏', 'fullscreen');
            e.preventDefault();
        }
    }
}

// 显示快捷键提示
function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcutHint');
    const textElement = document.getElementById('shortcutText');
    const iconElement = document.getElementById('shortcutIcon');

    if (shortcutHintTimeout) {
        clearTimeout(shortcutHintTimeout);
    }

    textElement.textContent = text;

    if (direction === 'left') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>';
    } else if (direction === 'right') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
    } else if (direction === 'up') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>';
    } else if (direction === 'down') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>';
    } else if (direction === 'fullscreen') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>';
    } else if (direction === 'play') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"></path>';
    }

    hintElement.classList.add('show');

    shortcutHintTimeout = setTimeout(() => {
        hintElement.classList.remove('show');
    }, 2000);
}

// 获取弹幕数据
async function loadDanmaku() {
    try {
        const episodeTitle = currentEpisodes[currentEpisodeIndex]?.title || '';
        const episodeMatch = episodeTitle.match(/第?\s*(\d+)\s*集|EP?\s*(\d+)|#(\d+)#/i);
        const episodeNumber = episodeMatch ? 
            parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]) : 
            currentEpisodeIndex + 1;
        
        console.log(`尝试匹配弹幕: 标题=${currentVideoTitle}, 集数=${episodeNumber}, 索引=${currentEpisodeIndex}`);
        
        let matchResult = null;
        if (art && art.video && art.video.duration > 0) {
            try {
                const matchRes = await fetch(`${DANMU_API_URL}/api/v2/match`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        fileName: `${currentVideoTitle} S01E${episodeNumber.toString().padStart(2, '0')}`,
                        fileHash: '',
                        videoDuration: Math.floor(art.video.duration),
                        episodeIndex: episodeNumber
                    })
                });
                
                if (matchRes.ok) {
                    const matchData = await matchRes.json();
                    if (matchData.isMatched && matchData.matches && matchData.matches.length > 0) {
                        matchResult = matchData.matches[0];
                        console.log('弹幕匹配成功(match):', matchResult);
                    }
                }
            } catch (e) {
                console.log('match 接口失败,尝试 search:', e);
            }
        }
        
        if (!matchResult) {
            const searchRes = await fetch(
                `${DANMU_API_URL}/api/v2/search/anime?keyword=${encodeURIComponent(currentVideoTitle)}`
            );
            const searchData = await searchRes.json();
            
            if (!searchData.animes || searchData.animes.length === 0) {
                console.log('未找到匹配的动漫');
                return [];
            }
            
            const animeId = searchData.animes[0].animeId;
            const detailRes = await fetch(`${DANMU_API_URL}/api/v2/bangumi/${animeId}`);
            const detailData = await detailRes.json();
            
            const episodes = detailData.bangumi.episodes || [];
            console.log('可用剧集:', episodes);
            
            let episode = episodes.find(ep => parseInt(ep.episodeNumber) === episodeNumber);
            if (!episode && episodes[currentEpisodeIndex]) {
                episode = episodes[currentEpisodeIndex];
            }
            
            if (!episode) {
                console.log(`未找到第 ${episodeNumber} 集`);
                return [];
            }
            
            matchResult = {
                animeId: animeId,
                episodeId: episode.episodeId,
                commentId: episode.episodeId
            };
            console.log('弹幕匹配成功(search):', matchResult);
        }
        
        if (!matchResult || !matchResult.commentId) {
            console.log('无法获取 commentId');
            return [];
        }
        
        const commentRes = await fetch(
            `${DANMU_API_URL}/api/v2/comment/${matchResult.commentId}?withRelated=true&chConvert=1`
        );
        const commentData = await commentRes.json();
        
        console.log('原始弹幕数据:', commentData);
        
        if (!commentData.comments || commentData.comments.length === 0) {
            console.log('该集暂无弹幕');
            return [];
        }
        
        // 安全处理弹幕数据
        const danmakuList = commentData.comments
            .filter(c => c && c.m && typeof c.p !== 'undefined')
            .map(c => {
                let color = '#FFFFFF';
                if (c.c !== undefined && c.c !== null) {
                    try {
                        const colorNum = parseInt(c.c);
                        if (!isNaN(colorNum)) {
                            color = `#${colorNum.toString(16).padStart(6, '0')}`;
                        }
                    } catch (e) {
                        console.warn('颜色转换失败:', c.c);
                    }
                }
                
                return {
                    text: String(c.m || ''),
                    time: parseFloat(c.p) / 1000 || 0,
                    color: color,
                    mode: parseInt(c.mode) || 0
                };
            })
            .filter(d => d.text.trim().length > 0);
        
        console.log(`成功加载 ${danmakuList.length} 条弹幕`);
        showToast(`已加载 ${danmakuList.length} 条弹幕`, 'success');
        danmakuData = danmakuList; // 缓存弹幕数据
        
        return danmakuList;
    } catch (error) {
        console.error('加载弹幕失败:', error);
        showToast('弹幕加载失败', 'error');
        return [];
    }
}

// 预加载弹幕（不依赖播放器）
async function preloadDanmaku() {
    try {
        const episodeTitle = currentEpisodes[currentEpisodeIndex]?.title || '';
        const episodeMatch = episodeTitle.match(/第?\s*(\d+)\s*集|EP?\s*(\d+)|#(\d+)#/i);
        const episodeNumber = episodeMatch ? 
            parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]) : 
            currentEpisodeIndex + 1;
        
        console.log(`预加载弹幕: 标题=${currentVideoTitle}, 集数=${episodeNumber}`);
        
        const searchRes = await fetch(
            `${DANMU_API_URL}/api/v2/search/anime?keyword=${encodeURIComponent(currentVideoTitle)}`
        );
        const searchData = await searchRes.json();
        
        if (!searchData.animes || searchData.animes.length === 0) {
            return [];
        }
        
        const animeId = searchData.animes[0].animeId;
        const detailRes = await fetch(`${DANMU_API_URL}/api/v2/bangumi/${animeId}`);
        const detailData = await detailRes.json();
        
        const episodes = detailData.bangumi.episodes || [];
        let episode = episodes.find(ep => parseInt(ep.episodeNumber) === episodeNumber);
        if (!episode && episodes[currentEpisodeIndex]) {
            episode = episodes[currentEpisodeIndex];
        }
        
        if (!episode) {
            return [];
        }
        
        const commentRes = await fetch(
            `${DANMU_API_URL}/api/v2/comment/${episode.episodeId}?withRelated=true&chConvert=1`
        );
        const commentData = await commentRes.json();
        
        if (!commentData.comments || commentData.comments.length === 0) {
            return [];
        }
        
        const danmakuList = commentData.comments
            .filter(c => c && c.m && typeof c.p !== 'undefined')
            .map(c => {
                let color = '#FFFFFF';
                if (c.c !== undefined && c.c !== null) {
                    try {
                        const colorNum = parseInt(c.c);
                        if (!isNaN(colorNum)) {
                            color = `#${colorNum.toString(16).padStart(6, '0')}`;
                        }
                    } catch (e) {
                        console.warn('颜色转换失败:', c.c);
                    }
                }
                
                return {
                    text: String(c.m || ''),
                    time: parseFloat(c.p) / 1000 || 0,
                    color: color,
                    mode: parseInt(c.mode) || 0
                };
            })
            .filter(d => d.text.trim().length > 0);
        
        console.log(`预加载完成 ${danmakuList.length} 条弹幕`);
        danmakuData = danmakuList;
        return danmakuList;
    } catch (error) {
        console.error('预加载弹幕失败:', error);
        return [];
    }
}

// 初始化播放器（包含弹幕插件）
function initPlayer(videoUrl) {
    if (!videoUrl) {
        return;
    }

    if (art) {
        art.destroy();
        art = null;
    }

    const hlsConfig = {
        debug: false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true,
        appendErrorMaxRetry: 5,
        liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    // 配置 ArtPlayer 插件
	const plugins = [];

	// 如果有 artplayerPluginDanmuku 插件，添加弹幕功能
	if (typeof artplayerPluginDanmuku !== 'undefined') {
		const savedConfig = loadDanmakuConfig();
    
		console.log('初始化弹幕插件，当前弹幕数量:', danmakuData.length);
    
		plugins.push(
			artplayerPluginDanmuku({
				danmuku: danmakuData.length > 0 ? danmakuData : [], // 使用已加载的弹幕
				speed: savedConfig.speed,
				opacity: savedConfig.opacity,
				fontSize: savedConfig.fontSize,
				color: savedConfig.color,
				mode: savedConfig.mode,
				margin: savedConfig.margin,
				antiOverlap: savedConfig.antiOverlap,
				useWorker: savedConfig.useWorker,
				synchronousPlayback: savedConfig.synchronousPlayback
			})
		);
	}

    art = new Artplayer({
        container: '#player',
        url: videoUrl,
        type: 'm3u8',
        title: currentVideoTitle,
        volume: 0.8,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        hotkey: false,
        theme: '#23ade5',
        lang: navigator.language.toLowerCase(),
        moreVideoAttr: {
            crossOrigin: 'anonymous',
        },
        plugins: plugins,
        customType: {
            m3u8: function (video, url) {
                if (currentHls && currentHls.destroy) {
                    try {
                        currentHls.destroy();
                    } catch (e) {
                    }
                }

                const hls = new Hls(hlsConfig);
                currentHls = hls;

                let errorDisplayed = false;
                let errorCount = 0;
                let playbackStarted = false;
                let bufferAppendErrorCount = 0;

                video.addEventListener('playing', function () {
                    playbackStarted = true;
                    document.getElementById('player-loading').style.display = 'none';
                    document.getElementById('error').style.display = 'none';
                });

				video.addEventListener('timeupdate', function () {
					if (video.currentTime > 1) {
							document.getElementById('error').style.display = 'none';
					}
				});

				hls.loadSource(url);
				hls.attachMedia(video);
				
				let sourceElement = video.querySelector('source');
				if (sourceElement) {
					sourceElement.src = videoUrl;
				} else {
					sourceElement = document.createElement('source');
					sourceElement.src = videoUrl;
					video.appendChild(sourceElement);
				}
				video.disableRemotePlayback = false;

				hls.on(Hls.Events.MANIFEST_PARSED, function () {
					video.play().catch(e => {
					});
				});
	
				hls.on(Hls.Events.ERROR, function (event, data) {
					errorCount++;

					if (data.details === 'bufferAppendError') {
						bufferAppendErrorCount++;
						if (playbackStarted) {
							return;
						}

						if (bufferAppendErrorCount >= 3) {
							hls.recoverMediaError();
						}
					}
	
					if (data.fatal && !playbackStarted) {
						switch (data.type) {
							case Hls.ErrorTypes.NETWORK_ERROR:
								hls.startLoad();
								break;
							case Hls.ErrorTypes.MEDIA_ERROR:
								hls.recoverMediaError();
								break;
							default:
								if (errorCount > 3 && !errorDisplayed) {
									errorDisplayed = true;
									showError('视频加载失败，可能是格式不兼容或源不可用');
								}
								break;
						}
					}
				});

					hls.on(Hls.Events.FRAG_LOADED, function () {
						document.getElementById('player-loading').style.display = 'none';
					});

					hls.on(Hls.Events.LEVEL_LOADED, function () {
						document.getElementById('player-loading').style.display = 'none';
					});
				}
			}
		});

		let hideTimer;

		function hideControls() {
			if (art && art.controls) {
				art.controls.show = false;
        }
		}

		function resetHideTimer() {
			clearTimeout(hideTimer);
			hideTimer = setTimeout(() => {
				hideControls();
			}, Artplayer.CONTROL_HIDE_TIME);
		}

		function handleMouseOut(e) {
			if (e && !e.relatedTarget) {
				resetHideTimer();
			}
		}

		function handleFullScreen(isFullScreen, isWeb) {
			if (isFullScreen) {
				document.addEventListener('mouseout', handleMouseOut);
			} else {
				document.removeEventListener('mouseout', handleMouseOut);
				clearTimeout(hideTimer);
			}

			if (!isWeb) {
				if (window.screen.orientation && window.screen.orientation.lock) {
					window.screen.orientation.lock('landscape')
						.then(() => {
						})
						.catch((error) => {
						});
				}
			}
		}

		art.on('ready', () => {
    hideControls();
    
		// 监听弹幕配置变化并保存
		if (art.plugins && art.plugins.artplayerPluginDanmuku) {
			const danmakuPlugin = art.plugins.artplayerPluginDanmuku;
			const originalConfig = loadDanmakuConfig();
        
			setInterval(() => {
				if (danmakuPlugin.option) {
					const currentConfig = {
						speed: danmakuPlugin.option.speed,
						opacity: danmakuPlugin.option.opacity,
						fontSize: danmakuPlugin.option.fontSize,
						color: danmakuPlugin.option.color,
						mode: danmakuPlugin.option.mode,
						margin: danmakuPlugin.option.margin,
						antiOverlap: danmakuPlugin.option.antiOverlap,
						useWorker: danmakuPlugin.option.useWorker,
						synchronousPlayback: danmakuPlugin.option.synchronousPlayback
					};
                
					if (JSON.stringify(currentConfig) !== JSON.stringify(originalConfig)) {
						saveDanmakuConfig(currentConfig);
						Object.assign(originalConfig, currentConfig);
					}
				}
			}, 2000);
		}
	});

	// 在视频可以播放时加载弹幕

    art.on('fullscreenWeb', function (isFullScreen) {
        handleFullScreen(isFullScreen, true);
    });

    art.on('fullscreen', function (isFullScreen) {
        handleFullScreen(isFullScreen, false);
    });

    art.on('video:loadedmetadata', function() {
        document.getElementById('player-loading').style.display = 'none';
        videoHasEnded = false;
        
        const urlParams = new URLSearchParams(window.location.search);
        const savedPosition = parseInt(urlParams.get('position') || '0');

        if (savedPosition > 10 && savedPosition < art.duration - 2) {
            art.currentTime = savedPosition;
            showPositionRestoreHint(savedPosition);
        } else {
            try {
                const progressKey = 'videoProgress_' + getVideoId();
                const progressStr = localStorage.getItem(progressKey);
                if (progressStr && art.duration > 0) {
                    const progress = JSON.parse(progressStr);
                    if (
                        progress &&
                        typeof progress.position === 'number' &&
                        progress.position > 10 &&
                        progress.position < art.duration - 2
                    ) {
                        art.currentTime = progress.position;
                        showPositionRestoreHint(progress.position);
                    }
                }
            } catch (e) {
            }
        }

        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000);
        startProgressSaveInterval();
    })

    art.on('video:error', function (error) {
        if (window.isSwitchingVideo) {
            return;
        }

        const loadingElements = document.querySelectorAll('#player-loading, .player-loading-container');
        loadingElements.forEach(el => {
            if (el) el.style.display = 'none';
        });

        showError('视频播放失败: ' + (error.message || '未知错误'));
    });

    setupLongPressSpeedControl();

    art.on('video:ended', function () {
        videoHasEnded = true;
        clearVideoProgress();

        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            setTimeout(() => {
                playNextEpisode();
                videoHasEnded = false;
            }, 1000);
        } else {
            art.fullscreen = false;
        }
    });

    art.on('video:playing', () => {
        if (art.video) {
            art.video.addEventListener('dblclick', () => {
                art.fullscreen = !art.fullscreen;
                art.play();
            });
        }
    });

    setTimeout(function () {
        if (art && art.video && art.video.currentTime > 0) {
            return;
        }

        const loadingElement = document.getElementById('player-loading');
        if (loadingElement && loadingElement.style.display !== 'none') {
            loadingElement.innerHTML = `
                <div class="loading-spinner"></div>
                <div>视频加载时间较长，请耐心等待...</div>
                <div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源</div>
            `;
        }
    }, 10000);
}

// 自定义M3U8 Loader用于过滤广告
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const load = this.load.bind(this);
        this.load = function (context, config, callbacks) {
            if (context.type === 'manifest' || context.type === 'level') {
                const onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (response, stats, context) {
                    if (response.data && typeof response.data === 'string') {
                        response.data = filterAdsFromM3U8(response.data, true);
                    }
                    return onSuccess(response, stats, context);
                };
            }
            load(context, config, callbacks);
        };
    }
}

function filterAdsFromM3U8(m3u8Content, strictMode = false) {
    if (!m3u8Content) return '';

    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.includes('#EXT-X-DISCONTINUITY')) {
            filteredLines.push(line);
        }
    }

    return filteredLines.join('\n');
}

function showError(message) {
    if (art && art.video && art.video.currentTime > 1) {
        return;
    }
    const loadingEl = document.getElementById('player-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'flex';
    const errorMsgEl = document.getElementById('error-message');
    if (errorMsgEl) errorMsgEl.textContent = message;
}

function updateEpisodeInfo() {
    if (currentEpisodes.length > 0) {
        document.getElementById('episodeInfo').textContent = `第 ${currentEpisodeIndex + 1}/${currentEpisodes.length} 集`;
    } else {
        document.getElementById('episodeInfo').textContent = '无集数信息';
    }
}

function updateButtonStates() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    if (currentEpisodeIndex > 0) {
        prevButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        prevButton.removeAttribute('disabled');
    } else {
        prevButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        prevButton.setAttribute('disabled', '');
    }

    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        nextButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        nextButton.removeAttribute('disabled');
    } else {
        nextButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        nextButton.setAttribute('disabled', '');
    }
}

function renderEpisodes() {
    const episodesList = document.getElementById('episodesList');
    if (!episodesList) return;

    if (!currentEpisodes || currentEpisodes.length === 0) {
        episodesList.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">没有可用的集数</div>';
        return;
    }

    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    let html = '';

    episodes.forEach((episode, index) => {
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        const isActive = realIndex === currentEpisodeIndex;

        html += `
            <button id="episode-${realIndex}" 
                    onclick="playEpisode(${realIndex})" 
                    class="px-4 py-2 ${isActive ? 'episode-active' : '!bg-[#222] hover:!bg-[#333] hover:!shadow-none'} !border ${isActive ? '!border-blue-500' : '!border-[#333]'} rounded-lg transition-colors text-center episode-btn">
                ${realIndex + 1}
            </button>
        `;
    });

    episodesList.innerHTML = html;
}

function playEpisode(index) {
    if (index < 0 || index >= currentEpisodes.length) {
        return;
    }

    if (art && art.video && !art.video.paused && !videoHasEnded) {
        saveCurrentProgress();
    }

    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
        progressSaveInterval = null;
    }

    // 立即销毁旧播放器
    if (art) {
        try {
            art.destroy();
            art = null;
        } catch (e) {
            console.error('销毁播放器失败:', e);
        }
    }

    document.getElementById('error').style.display = 'none';
    document.getElementById('player-loading').style.display = 'flex';
    document.getElementById('player-loading').innerHTML = `
        <div class="loading-spinner"></div>
        <div>正在加载视频和弹幕...</div>
    `;

    const urlParams2 = new URLSearchParams(window.location.search);
    const sourceCode = urlParams2.get('source_code');

    const url = currentEpisodes[index];

    currentEpisodeIndex = index;
    currentVideoUrl = url;
    videoHasEnded = false;
    danmakuData = []; // 清空弹幕缓存

    clearVideoProgress();

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('index', index);
    currentUrl.searchParams.set('url', url);
    currentUrl.searchParams.delete('position');
    window.history.replaceState({}, '', currentUrl.toString());

    // 先预加载弹幕，等待完成后再初始化播放器
	preloadDanmaku()
		.then(() => {
			console.log('弹幕预加载完成，开始初始化播放器，弹幕数量:', danmakuData.length);
			// 确保弹幕数据已经准备好再初始化播放器
			initPlayer(url);
		})
		.catch(e => {
			console.error('预加载弹幕失败:', e);
			// 即使弹幕加载失败，也要初始化播放器
			initPlayer(url);
		});

    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();

    userClickedPosition = null;

    setTimeout(() => saveToHistory(), 3000);
}

function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || '';
    if (linkUrl !== '') {
        navigator.clipboard.writeText(linkUrl).then(() => {
            showToast('播放链接已复制', 'success');
        }).catch(err => {
            showToast('复制失败，请检查浏览器权限', 'error');
        });
    }
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed);
    renderEpisodes();
    updateOrderButton();
}

function updateOrderButton() {
    const orderText = document.getElementById('orderText');
    const orderIcon = document.getElementById('orderIcon');

    if (orderText && orderIcon) {
        orderText.textContent = episodesReversed ? '正序排列' : '倒序排列';
        orderIcon.style.transform = episodesReversed ? 'rotate(180deg)' : '';
    }
}

function setupProgressBarPreciseClicks() {
    const progressBar = document.querySelector('.dplayer-bar-wrap');
    if (!progressBar || !art || !art.video) return;

    progressBar.removeEventListener('mousedown', handleProgressBarClick);
    progressBar.addEventListener('mousedown', handleProgressBarClick);

    progressBar.removeEventListener('touchstart', handleProgressBarTouch);
    progressBar.addEventListener('touchstart', handleProgressBarTouch);

    function handleProgressBarClick(e) {
        if (!art || !art.video) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (e.clientX - rect.left) / rect.width;

        const duration = art.video.duration;
        let clickTime = percentage * duration;

        if (duration - clickTime < 1) {
            clickTime = Math.min(clickTime, duration - 1.5);
        }

        userClickedPosition = clickTime;

        e.stopPropagation();

        art.seek(clickTime);
    }

    function handleProgressBarTouch(e) {
        if (!art || !art.video || !e.touches[0]) return;

        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (touch.clientX - rect.left) / rect.width;

        const duration = art.video.duration;
        let clickTime = percentage * duration;

        if (duration - clickTime < 1) {
            clickTime = Math.min(clickTime, duration - 1.5);
        }

        userClickedPosition = clickTime;

        e.stopPropagation();
        art.seek(clickTime);
    }
}

function saveToHistory() {
    if (!currentEpisodes || currentEpisodes.length === 0 || !currentVideoUrl) {
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sourceName = urlParams.get('source') || '';
    const sourceCode = urlParams.get('source') || '';
    const id_from_params = urlParams.get('id');

    let currentPosition = 0;
    let videoDuration = 0;

    if (art && art.video) {
        currentPosition = art.video.currentTime;
        videoDuration = art.video.duration;
    }

    let show_identifier_for_video_info;
    if (sourceName && id_from_params) {
        show_identifier_for_video_info = `${sourceName}_${id_from_params}`;
    } else {
        show_identifier_for_video_info = (currentEpisodes && currentEpisodes.length > 0) ? currentEpisodes[0] : currentVideoUrl;
    }

    const videoInfo = {
        title: currentVideoTitle,
        directVideoUrl: currentVideoUrl,
        url: `player.html?url=${encodeURIComponent(currentVideoUrl)}&title=${encodeURIComponent(currentVideoTitle)}&source=${encodeURIComponent(sourceName)}&source_code=${encodeURIComponent(sourceCode)}&id=${encodeURIComponent(id_from_params || '')}&index=${currentEpisodeIndex}&position=${Math.floor(currentPosition || 0)}`,
        episodeIndex: currentEpisodeIndex,
        sourceName: sourceName,
        vod_id: id_from_params || '',
        sourceCode: sourceCode,
        showIdentifier: show_identifier_for_video_info,
        timestamp: Date.now(),
        playbackPosition: currentPosition,
        duration: videoDuration,
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };
    
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');

        const existingIndex = history.findIndex(item => 
            item.title === videoInfo.title && 
            item.sourceName === videoInfo.sourceName && 
            item.showIdentifier === videoInfo.showIdentifier
        );

        if (existingIndex !== -1) {
            const existingItem = history[existingIndex];
            existingItem.episodeIndex = videoInfo.episodeIndex;
            existingItem.timestamp = videoInfo.timestamp;
            existingItem.sourceName = videoInfo.sourceName;
            existingItem.sourceCode = videoInfo.sourceCode;
            existingItem.vod_id = videoInfo.vod_id;
            
            existingItem.directVideoUrl = videoInfo.directVideoUrl;
            existingItem.url = videoInfo.url;

            existingItem.playbackPosition = videoInfo.playbackPosition > 10 ? videoInfo.playbackPosition : (existingItem.playbackPosition || 0);
            existingItem.duration = videoInfo.duration || existingItem.duration;
            
            if (videoInfo.episodes && videoInfo.episodes.length > 0) {
                if (!existingItem.episodes || 
                    !Array.isArray(existingItem.episodes) || 
                    existingItem.episodes.length !== videoInfo.episodes.length || 
                    !videoInfo.episodes.every((ep, i) => ep === existingItem.episodes[i])) {
                    existingItem.episodes = [...videoInfo.episodes];
                }
            }
            
            const updatedItem = history.splice(existingIndex, 1)[0];
            history.unshift(updatedItem);
        } else {
            history.unshift(videoInfo);
        }

        if (history.length > 50) history.splice(50);

        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
    }
}

function showPositionRestoreHint(position) {
    if (!position || position < 10) return;

    const hint = document.createElement('div');
    hint.className = 'position-restore-hint';
    hint.innerHTML = `
        <div class="hint-content">
            已从 ${formatTime(position)} 继续播放
        </div>
    `;

    const playerContainer = document.querySelector('.player-container');
    if (playerContainer) {
        playerContainer.appendChild(hint);
    } else {
        return;
    }

    setTimeout(() => {
        hint.classList.add('show');

        setTimeout(() => {
            hint.classList.remove('show');
            setTimeout(() => hint.remove(), 300);
        }, 3000);
    }, 100);
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startProgressSaveInterval() {
    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
    }

    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

function saveCurrentProgress() {
    if (!art || !art.video) return;
    const currentTime = art.video.currentTime;
    const duration = art.video.duration;
    if (!duration || currentTime < 1) return;

    const progressKey = `videoProgress_${getVideoId()}`;
    const progressData = {
        position: currentTime,
        duration: duration,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(progressKey, JSON.stringify(progressData));
        
        try {
            const historyRaw = localStorage.getItem('viewingHistory');
            if (historyRaw) {
                const history = JSON.parse(historyRaw);
                const idx = history.findIndex(item =>
                    item.title === currentVideoTitle &&
                    (item.episodeIndex === undefined || item.episodeIndex === currentEpisodeIndex)
                );
                if (idx !== -1) {
                    if (
                        Math.abs((history[idx].playbackPosition || 0) - currentTime) > 2 ||
                        Math.abs((history[idx].duration || 0) - duration) > 2
                    ) {
                        history[idx].playbackPosition = currentTime;
                        history[idx].duration = duration;
                        history[idx].timestamp = Date.now();
                        localStorage.setItem('viewingHistory', JSON.stringify(history));
                    }
                }
            }
        } catch (e) {
        }
    } catch (e) {
    }
}

function setupLongPressSpeedControl() {
    if (!art || !art.video) return;

    const playerElement = document.getElementById('player');
    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let isLongPress = false;

    function showSpeedHint(speed) {
        showShortcutHint(`${speed}倍速`, 'right');
    }

    playerElement.oncontextmenu = () => {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            const dplayerMenu = document.querySelector(".dplayer-menu");
            const dplayerMask = document.querySelector(".dplayer-mask");
            if (dplayerMenu) dplayerMenu.style.display = "none";
            if (dplayerMask) dplayerMask.style.display = "none";
            return false;
        }
        return true;
    };

    playerElement.addEventListener('touchstart', function (e) {
        if (art.video.paused) {
            return;
        }

        originalPlaybackRate = art.video.playbackRate;

        longPressTimer = setTimeout(() => {
            if (art.video.paused) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }

            art.video.playbackRate = 3.0;
            isLongPress = true;
            showSpeedHint(3.0);

            e.preventDefault();
        }, 500);
    }, { passive: false });

    playerElement.addEventListener('touchend', function (e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
            showSpeedHint(originalPlaybackRate);

            e.preventDefault();
        }
    });

    playerElement.addEventListener('touchcancel', function () {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }
    });

    playerElement.addEventListener('touchmove', function (e) {
        if (isLongPress) {
            e.preventDefault();
        }
    }, { passive: false });

    art.video.addEventListener('pause', function () {
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });
}

function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
    } catch (e) {
    }
}

function getVideoId() {
    if (currentVideoUrl) {
        return `${encodeURIComponent(currentVideoUrl)}`;
    }
    return `${encodeURIComponent(currentVideoTitle)}_${currentEpisodeIndex}`;
}

let controlsLocked = false;
function toggleControlsLock() {
    const container = document.getElementById('playerContainer');
    controlsLocked = !controlsLocked;
    container.classList.toggle('controls-locked', controlsLocked);
    const icon = document.getElementById('lockIcon');
    icon.innerHTML = controlsLocked
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M12 15v2m0-8V7a4 4 0 00-8 0v2m8 0H4v8h16v-8H6v-6z\"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M15 11V7a3 3 0 00-6 0v4m-3 4h12v6H6v-6z\"/>';
}

function closeEmbeddedPlayer() {
    try {
        if (window.self !== window.top) {
            if (window.parent && typeof window.parent.closeVideoPlayer === 'function') {
                window.parent.closeVideoPlayer();
                return true;
            }
        }
    } catch (e) {
        console.error('尝试关闭嵌入式播放器失败:', e);
    }
    return false;
}

function renderResourceInfoBar() {
    const container = document.getElementById('resourceInfoBarContainer');
    if (!container) {
        console.error('找不到资源信息卡片容器');
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentSource = urlParams.get('source') || '';
    
    container.innerHTML = `
      <div class="resource-info-bar-left flex">
        <span>加载中...</span>
        <span class="resource-info-bar-videos">-</span>
      </div>
      <button class="resource-switch-btn flex" id="switchResourceBtn" onclick="showSwitchResourceModal()">
        <span class="resource-switch-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="#a67c2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        切换资源
      </button>
    `;

    let resourceName = currentSource
    if (currentSource && API_SITES[currentSource]) {
        resourceName = API_SITES[currentSource].name;
    }
    if (resourceName === currentSource) {
        const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        const customIndex = parseInt(currentSource.replace('custom_', ''), 10);
        if (customAPIs[customIndex]) {
            resourceName = customAPIs[customIndex].name || '自定义资源';
        }
    }

    container.innerHTML = `
      <div class="resource-info-bar-left flex">
        <span>${resourceName}</span>
        <span class="resource-info-bar-videos">${currentEpisodes.length} 个视频</span>
      </div>
      <button class="resource-switch-btn flex" id="switchResourceBtn" onclick="showSwitchResourceModal()">
        <span class="resource-switch-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="#a67c2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        切换资源
      </button>
    `;
}

async function testVideoSourceSpeed(sourceKey, vodId) {
    try {
        const startTime = performance.now();
        
        let apiParams = '';
        if (sourceKey.startsWith('custom_')) {
            const customIndex = sourceKey.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                return { speed: -1, error: 'API配置无效' };
            }
            if (customApi.detail) {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&customDetail=' + encodeURIComponent(customApi.detail) + '&source=custom';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
            }
        } else {
            apiParams = '&source=' + sourceKey;
        }
        
        const timestamp = new Date().getTime();
        const cacheBuster = `&_t=${timestamp}`;
        
        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}${cacheBuster}`, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            return { speed: -1, error: '获取失败' };
        }
        
        const data = await response.json();
        
        if (!data.episodes || data.episodes.length === 0) {
            return { speed: -1, error: '无播放源' };
        }
        
        const firstEpisodeUrl = data.episodes[0];
        if (!firstEpisodeUrl) {
            return { speed: -1, error: '链接无效' };
        }
        
        const videoTestStart = performance.now();
        try {
            const videoResponse = await fetch(firstEpisodeUrl, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000)
            });
            
            const videoTestEnd = performance.now();
            const totalTime = videoTestEnd - startTime;
            
            return { 
                speed: Math.round(totalTime),
                episodes: data.episodes.length,
                error: null 
            };
        } catch (videoError) {
            const apiTime = performance.now() - startTime;
            return { 
                speed: Math.round(apiTime),
                episodes: data.episodes.length,
                error: null,
                note: 'API响应' 
            };
        }
        
    } catch (error) {
        return { 
            speed: -1, 
            error: error.name === 'AbortError' ? '超时' : '测试失败' 
        };
    }
}

function formatSpeedDisplay(speedResult) {
    if (speedResult.speed === -1) {
        return `<span class="speed-indicator error">❌ ${speedResult.error}</span>`;
    }
    
    const speed = speedResult.speed;
    let className = 'speed-indicator good';
    let icon = '🟢';
    
    if (speed > 2000) {
        className = 'speed-indicator poor';
        icon = '🔴';
    } else if (speed > 1000) {
        className = 'speed-indicator medium';
        icon = '🟡';
    }
    
    const note = speedResult.note ? ` (${speedResult.note})` : '';
    return `<span class="${className}">${icon} ${speed}ms${note}</span>`;
}

async function showSwitchResourceModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentSourceCode = urlParams.get('source');
    const currentVideoId = urlParams.get('id');

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    modalTitle.innerHTML = `<span class="break-words">${currentVideoTitle}</span>`;
    modalContent.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;grid-column:1/-1;">正在加载资源列表...</div>';
    modal.classList.remove('hidden');

    const resourceOptions = selectedAPIs.map((curr) => {
        if (API_SITES[curr]) {
            return { key: curr, name: API_SITES[curr].name };
        }
        const customIndex = parseInt(curr.replace('custom_', ''), 10);
        if (customAPIs[customIndex]) {
            return { key: curr, name: customAPIs[customIndex].name || '自定义资源' };
        }
        return { key: curr, name: '未知资源' };
    });
    
    let allResults = {};
    await Promise.all(resourceOptions.map(async (opt) => {
        let queryResult = await searchByAPIAndKeyWord(opt.key, currentVideoTitle);
        if (queryResult.length == 0) {
            return 
        }
        let result = queryResult[0]
        queryResult.forEach((res) => {
            if (res.vod_name == currentVideoTitle) {
                result = res;
            }
        })
        allResults[opt.key] = result;
    }));

    modalContent.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;grid-column:1/-1;">正在测试各资源速率...</div>';

    const speedResults = {};
    await Promise.all(Object.entries(allResults).map(async ([sourceKey, result]) => {
        if (result) {
            speedResults[sourceKey] = await testVideoSourceSpeed(sourceKey, result.vod_id);
        }
    }));

    const sortedResults = Object.entries(allResults).sort(([keyA, resultA], [keyB, resultB]) => {
        const isCurrentA = String(keyA) === String(currentSourceCode) && String(resultA.vod_id) === String(currentVideoId);
        const isCurrentB = String(keyB) === String(currentSourceCode) && String(resultB.vod_id) === String(currentVideoId);
        
        if (isCurrentA && !isCurrentB) return -1;
        if (!isCurrentA && isCurrentB) return 1;
        
        const speedA = speedResults[keyA]?.speed || 99999;
        const speedB = speedResults[keyB]?.speed || 99999;
        
        if (speedA === -1 && speedB !== -1) return 1;
        if (speedA !== -1 && speedB === -1) return -1;
        if (speedA === -1 && speedB === -1) return 0;
        
        return speedA - speedB;
    });

    let html = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">';
    
    for (const [sourceKey, result] of sortedResults) {
        if (!result) continue;
        
        const isCurrentSource = String(sourceKey) === String(currentSourceCode) && String(result.vod_id) === String(currentVideoId);
        const sourceName = resourceOptions.find(opt => opt.key === sourceKey)?.name || '未知资源';
        const speedResult = speedResults[sourceKey] || { speed: -1, error: '未测试' };
        
        html += `
            <div class="relative group ${isCurrentSource ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 transition-transform'}" 
                 ${!isCurrentSource ? `onclick="switchToResource('${sourceKey}', '${result.vod_id}')"` : ''}>
                <div class="aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 relative">
                    <img src="${result.vod_pic}" 
                         alt="${result.vod_name}"
                         class="w-full h-full object-cover"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9IjE3IDggMTIgMyA3IDgiPjwvcG9seWxpbmU+PHBhdGggZD0iTTEyIDN2MTIiPjwvcGF0aD48L3N2Zz4='">
                    
                    <div class="absolute top-1 right-1 speed-badge bg-black bg-opacity-75">
                        ${formatSpeedDisplay(speedResult)}
                    </div>
                </div>
                <div class="mt-2">
                    <div class="text-xs font-medium text-gray-200 truncate">${result.vod_name}</div>
                    <div class="text-[10px] text-gray-400 truncate">${sourceName}</div>
                    <div class="text-[10px] text-gray-500 mt-1">
                        ${speedResult.episodes ? `${speedResult.episodes}集` : ''}
                    </div>
                </div>
                ${isCurrentSource ? `
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="bg-blue-600 bg-opacity-75 rounded-lg px-2 py-0.5 text-xs text-white font-medium">
                            当前播放
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    html += '</div>';
    modalContent.innerHTML = html;
}

async function switchToResource(sourceKey, vodId) {
    document.getElementById('modal').classList.add('hidden');
    
    showLoading();
    try {
        let apiParams = '';
        
        if (sourceKey.startsWith('custom_')) {
            const customIndex = sourceKey.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                showToast('自定义API配置无效', 'error');
                hideLoading();
                return;
            }
            if (customApi.detail) {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&customDetail=' + encodeURIComponent(customApi.detail) + '&source=custom';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
            }
        } else {
            apiParams = '&source=' + sourceKey;
        }
        
        const timestamp = new Date().getTime();
        const cacheBuster = `&_t=${timestamp}`;
        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}${cacheBuster}`);
        
        const data = await response.json();
        
        if (!data.episodes || data.episodes.length === 0) {
            showToast('未找到播放资源', 'error');
            hideLoading();
            return;
        }

        const currentIndex = currentEpisodeIndex;
        
        let targetIndex = 0;
        if (currentIndex < data.episodes.length) {
            targetIndex = currentIndex;
        }
        
        const targetUrl = data.episodes[targetIndex];
        
        const watchUrl = `player.html?id=${vodId}&source=${sourceKey}&url=${encodeURIComponent(targetUrl)}&index=${targetIndex}&title=${encodeURIComponent(currentVideoTitle)}`;
        
        try {
            localStorage.setItem('currentVideoTitle', data.vod_name || '未知视频');
            localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
            localStorage.setItem('currentEpisodeIndex', targetIndex);
            localStorage.setItem('currentSourceCode', sourceKey);
            localStorage.setItem('lastPlayTime', Date.now());
        } catch (e) {
            console.error('保存播放状态失败:', e);
        }

        window.location.href = watchUrl;
        
    } catch (error) {
        console.error('切换资源失败:', error);
        showToast('切换资源失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}
