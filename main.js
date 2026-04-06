document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadsContainer = document.getElementById('uploads-container');
    const vaultContent = document.getElementById('vault-content');
    const refreshBtn = document.getElementById('refresh-btn');
    
    // Auth & Layout Elements
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const loginModal = document.getElementById('login-modal');
    const tokenInput = document.getElementById('token-input');
    const saveTokenBtn = document.getElementById('save-token-btn');
    const cancelTokenBtn = document.getElementById('cancel-token-btn');
    const uploadSection = document.getElementById('upload-section');
    const appSubtitle = document.getElementById('app-subtitle');

    // Preview Modal Elements
    const previewModal = document.getElementById('preview-modal');
    const closeModal = document.querySelector('.close-modal');
    const previewContainer = document.getElementById('preview-container');

    // GitHub Config Defaults
    const GITHUB_OWNER = 'Blueoegg';
    const GITHUB_REPO = 'senior';
    const REPO_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/uploads`;

    // --- Authentication Logic ---
    function getToken() {
        return localStorage.getItem('QD_GITHUB_TOKEN') || '';
    }

    function setToken(token) {
        if (token) {
            localStorage.setItem('QD_GITHUB_TOKEN', token.trim());
        } else {
            localStorage.removeItem('QD_GITHUB_TOKEN');
        }
        updateAuthUI();
    }

    function updateAuthUI() {
        const token = getToken();
        if (token) {
            uploadSection.style.display = 'block';
            adminLoginBtn.style.display = 'none';
            adminLogoutBtn.style.display = 'block';
            appSubtitle.textContent = '安全、快速地将您的文件发送到云端。';
        } else {
            uploadSection.style.display = 'none';
            adminLoginBtn.style.display = 'block';
            adminLogoutBtn.style.display = 'none';
            appSubtitle.textContent = '世界上最优雅的云端文件保险箱。';
        }
        fetchFiles(); // Re-fetch to show/hide delete buttons
    }

    // Modal listeners
    adminLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('show');
        tokenInput.value = '';
        tokenInput.focus();
    });
    
    adminLogoutBtn.addEventListener('click', () => {
        if(confirm('确定要退出登录吗？您将失去上传和删除的权限。')) {
            setToken(null);
        }
    });

    cancelTokenBtn.addEventListener('click', () => loginModal.classList.remove('show'));
    
    saveTokenBtn.addEventListener('click', () => {
        const val = tokenInput.value;
        if(val.startsWith('ghp_') || val.startsWith('github_pat_')) {
            setToken(val);
            loginModal.classList.remove('show');
        } else {
            alert('Token 格式可能不正确，通常以 ghp_ 或 github_pat_ 开头。');
        }
    });

    // Helper for Headers
    function getHeaders() {
        const token = getToken();
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `token ${token}`;
        return headers;
    }

    // Determine File Type
    function getFileType(ext) {
        ext = ext.toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
        if (['.mp4', '.webm', '.ogg'].includes(ext)) return 'video';
        if (['.pdf'].includes(ext)) return 'pdf';
        return 'file';
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]); 
            reader.onerror = error => reject(error);
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0 || !bytes) return '未知'; 
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Initialization
    updateAuthUI();
    refreshBtn.addEventListener('click', fetchFiles);

    // --- Drag and Drop Logic --- // Only works if upload section is visible
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
    });

    dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
    fileInput.addEventListener('change', function() { handleFiles(this.files); });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    function handleFiles(files) {
        if(!getToken()) return; // Failsafe
        ([...files]).forEach(uploadFile);
    }

    // --- Upload File Logic ---
    async function uploadFile(file) {
        const fileId = 'file-' + Math.random().toString(36).substr(2, 9);
        const fileItem = document.createElement('div');
        fileItem.className = 'upload-item';
        fileItem.id = fileId;

        fileItem.innerHTML = `
            <div class="file-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></div>
            <div class="file-info"><div class="file-name" title="${file.name}">${file.name}</div><div class="file-status-row"><span class="file-size">${formatBytes(file.size)}</span><span class="file-percentage" id="pct-${fileId}">上传中...</span></div></div>
            <div class="status-icon" id="status-${fileId}"></div>
        `;

        uploadsContainer.prepend(fileItem);
        const statusIconContainer = document.getElementById(`status-${fileId}`);

        try {
            const timestamp = Date.now();
            let rawBaseName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.\-_]/g, '_');
            const newFilename = `${timestamp}-${rawBaseName}`;
            
            const base64Content = await fileToBase64(file);
            const putUrl = `${REPO_API_URL}/${encodeURIComponent(newFilename)}`;
            
            const res = await fetch(putUrl, {
                method: 'PUT',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Upload ${file.name} via QuantumDrop Frontend`,
                    content: base64Content
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                if(res.status === 401 || res.status === 403) {
                    throw new Error('Token 无效或无权限');
                }
                throw new Error(errData.message || '上传失败啦');
            }

            statusIconContainer.innerHTML = `<span style="color:var(--success)">完成</span>`;
            document.getElementById(`pct-${fileId}`).textContent = '100%';
            
            setTimeout(fetchFiles, 1500);
            setTimeout(() => fileItem.remove(), 4000);

        } catch (error) {
            console.error('Upload Error:', error);
            document.getElementById(`pct-${fileId}`).textContent = error.message;
            document.getElementById(`pct-${fileId}`).style.color = 'var(--error)';
            statusIconContainer.innerHTML = `<span style="color:var(--error)">错误</span>`;
        }
    }

    // --- Fetch Logic ---
    async function fetchFiles() {
        refreshBtn.style.opacity = '0.5';
        try {
            const res = await fetch(REPO_API_URL, { headers: getHeaders() });
            
            if (res.status === 404) {
               renderVault([]);
               return;
            }

            if (!res.ok) throw new Error('拉取失败');
            const data = await res.json();
            
            const fileRecords = data
                .filter(item => item.type === 'file')
                .map(item => {
                    const parts = item.name.split('-');
                    let timeMs = 0;
                    let displayName = item.name;
                    
                    if (parts.length > 1 && !isNaN(parts[0]) && parts[0].length === 13) {
                        timeMs = parseInt(parts[0]);
                        displayName = parts.slice(1).join('-'); 
                    }

                    const ext = displayName.substring(displayName.lastIndexOf('.'));
                    const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}/${item.path}`;

                    return {
                        name: displayName,
                        pathName: item.name, 
                        sha: item.sha, // Required for deletion!
                        size: item.size,
                        timeMs: timeMs,
                        path: cdnUrl,
                        type: getFileType(ext)
                    };
                });

            fileRecords.sort((a, b) => b.timeMs - a.timeMs);

            const grouped = [];
            let currentGroup = null;
            const now = new Date();
            const todayStr = now.toDateString();
            const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();

            fileRecords.forEach(file => {
                let groupLabel = '早期文件';
                if (file.timeMs > 0) {
                    const fileDate = new Date(file.timeMs);
                    const fileDateStr = fileDate.toDateString();
                    if (fileDateStr === todayStr) groupLabel = '今天';
                    else if (fileDateStr === yesterdayStr) groupLabel = '昨天';
                    else groupLabel = `${fileDate.getFullYear()}年${fileDate.getMonth() + 1}月${fileDate.getDate()}日`;
                }

                if (!currentGroup || currentGroup.label !== groupLabel) {
                    currentGroup = { label: groupLabel, files: [] };
                    grouped.push(currentGroup);
                }

                currentGroup.files.push(file);
            });

            renderVault(grouped);

        } catch (error) {
            console.error('Fetch error:', error);
            vaultContent.innerHTML = `<p style="text-align:center;color:var(--error);">无法连接到 GitHub (${error.message})</p>`;
        } finally {
            refreshBtn.style.opacity = '1';
        }
    }

    // --- Delete File Logic ---
    async function deleteFile(fileName, sha) {
        if(!confirm(`确定要永久删除 ${fileName} 吗？\n删除后不可恢复！`)) return;

        const originalText = vaultContent.innerHTML;
        vaultContent.innerHTML = '<p style="text-align:center; color: var(--accent-1);">正在删除 (Deleting)...</p>';

        try {
            const res = await fetch(`${REPO_API_URL}/${fileName}`, {
                method: 'DELETE',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Delete ${fileName} via QuantumDrop Frontend`,
                    sha: sha
                })
            });

            if(!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '删除失败');
            }

            // Target branch might be different but usually default works.
            fetchFiles(); // Re-pull data

        } catch(e) {
            console.error(e);
            alert('删除失败: ' + e.message);
            vaultContent.innerHTML = originalText;
            attachVaultListeners(); // re-attach listeners because we restored innerHTML
        }
    }

    // --- Render Vault ---
    function renderVault(groupedFiles) {
        if (!groupedFiles || groupedFiles.length === 0) {
            vaultContent.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无文件，极度空虚！</p>';
            return;
        }

        vaultContent.innerHTML = '';
        const hasToken = !!getToken();
        
        groupedFiles.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'date-group';
            groupDiv.innerHTML = `<div class="date-group-title">${group.label}</div>`;

            const listDiv = document.createElement('div');
            listDiv.className = 'vault-list';

            group.files.forEach(file => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'vault-item';
                
                let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
                let previewBtnHTML = '';
                if (file.type === 'image' || file.type === 'video' || file.type === 'pdf') {
                    if (file.type === 'image') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
                    if (file.type === 'video') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
                    if (file.type === 'pdf') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
                    previewBtnHTML = `<button class="action-btn preview-action" data-path="${file.path}" data-type="${file.type}">预览</button>`;
                }

                // If admin, show delete button
                const deleteBtnHTML = hasToken ? `<button class="action-btn delete-btn" data-filename="${file.pathName}" data-sha="${file.sha}">删除</button>` : '';

                itemDiv.innerHTML = `
                    <div class="file-icon">${iconSvg}</div>
                    <div class="file-info">
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-meta-row">${formatBytes(file.size)}</div>
                    </div>
                    <div class="vault-actions">
                        ${previewBtnHTML}
                        <a href="${file.path}" target="_blank" download="${file.name}" class="action-btn">外链/下载</a>
                        ${deleteBtnHTML}
                    </div>
                `;
                listDiv.appendChild(itemDiv);
            });

            groupDiv.appendChild(listDiv);
            vaultContent.appendChild(groupDiv);
        });

        attachVaultListeners();
    }

    function attachVaultListeners() {
        document.querySelectorAll('.preview-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const path = e.target.getAttribute('data-path');
                const type = e.target.getAttribute('data-type');
                openPreview(path, type);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filename = e.target.getAttribute('data-filename');
                const sha = e.target.getAttribute('data-sha');
                deleteFile(filename, sha);
            });
        });
    }

    function openPreview(path, type) {
        previewContainer.innerHTML = '';
        if (type === 'image') {
            const img = document.createElement('img');
            img.src = path;
            previewContainer.appendChild(img);
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.src = path;
            video.controls = true;
            video.autoplay = true;
            previewContainer.appendChild(video);
        } else if (type === 'pdf') {
            previewContainer.innerHTML = '<div id="pdf-viewer" style="width: 100%; height: 100%; overflow-y: auto; text-align: center; background: #333; border-radius: 8px; padding: 10px; box-sizing: border-box; -webkit-overflow-scrolling: touch;"></div>';
            const pdfViewer = document.getElementById('pdf-viewer');
            pdfViewer.innerHTML = '<p style="color: white; margin-top: 2rem;">正在加载 PDF 引擎...</p>';

            if (typeof pdfjsLib === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
                script.onload = () => {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
                    renderPDF(path, pdfViewer);
                };
                script.onerror = () => { pdfViewer.innerHTML = '<p style="color: #ffbaba; margin-top: 2rem;">PDF 引擎加载失败，请检查网络</p>'; };
                document.head.appendChild(script);
            } else {
                renderPDF(path, pdfViewer);
            }
        }
        previewModal.classList.add('show');
    }

    function renderPDF(path, container) {
        container.innerHTML = '<p style="color: white; margin-top: 2rem;">正在解析 PDF 数据...</p>';
        const loadingTask = pdfjsLib.getDocument(path);
        loadingTask.promise.then(async pdf => {
            container.innerHTML = '';
            for(let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const isMobile = window.innerWidth <= 768;
                // dynamic scaling to fit container
                const unscaledViewport = page.getViewport({ scale: 1.0 });
                // Account for scrollbar width and padding
                const desiredWidth = container.clientWidth - (isMobile ? 24 : 40);
                const scale = desiredWidth / unscaledViewport.width;
                // Limit scale up on very wide screens so it doesn't get ridiculously large
                const finalScale = Math.min(scale, 1.5); 
                
                const viewport = page.getViewport({ scale: finalScale });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.maxWidth = '100%';
                canvas.style.height = 'auto';
                canvas.style.display = 'block';
                canvas.style.margin = '0 auto 15px auto';
                canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                canvas.style.backgroundColor = '#fff';
                canvas.style.borderRadius = '4px';
                
                container.appendChild(canvas);
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                await page.render(renderContext).promise;
            }
        }).catch(err => {
            container.innerHTML = `<p style="color: #ffbaba; margin-top: 2rem;">文件加载或渲染失败: ${err.message}</p>`;
        });
    }

    closeModal.addEventListener('click', () => { previewModal.classList.remove('show'); previewContainer.innerHTML = ''; });
    window.addEventListener('click', (e) => { if (e.target === previewModal) { previewModal.classList.remove('show'); previewContainer.innerHTML = ''; } });
});
