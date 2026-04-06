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

    // New Nav Elements
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const searchInput = document.getElementById('search-input');
    const currentPathDisplay = document.getElementById('current-path-display');
    const newFolderBtn = document.getElementById('new-folder-btn');
    const toggleFavoritesBtn = document.getElementById('toggle-favorites-btn');

    // GitHub Config Defaults
    const GITHUB_OWNER = 'Blueoegg';
    const GITHUB_REPO = 'senior';
    const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
    const DEFAULT_BRANCH = 'main';

    // State
    let fullTreeData = [];
    let currentPath = 'uploads/'; // Root folder for files
    let isShowFavoritesOnly = false;
    let searchQuery = '';

    // --- Theme & Metadata Logic ---
    const savedTheme = localStorage.getItem('QD_THEME') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if(themeToggleBtn) themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const curr = document.documentElement.getAttribute('data-theme');
            const next = curr === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('QD_THEME', next);
            themeToggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        });
    }

    function getMeta() {
        try { return JSON.parse(localStorage.getItem('QD_FILE_META') || '{}'); } catch { return {}; }
    }
    function updateMeta(sha, updates) {
        const meta = getMeta();
        if(!meta[sha]) meta[sha] = {};
        Object.assign(meta[sha], updates);
        localStorage.setItem('QD_FILE_META', JSON.stringify(meta));
    }
    window.toggleFav = function(sha) {
        const meta = getMeta();
        const isFav = meta[sha]?.isFav || false;
        updateMeta(sha, { isFav: !isFav });
        renderVault();
    }
    window.promptComment = function(sha) {
        const meta = getMeta();
        const existing = meta[sha]?.comment || '';
        const input = prompt('输入您的学习批注 (清空则删除):', existing);
        if(input !== null) {
            updateMeta(sha, { comment: input.trim() });
            renderVault();
        }
    }

    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderVault();
        });
    }

    if(toggleFavoritesBtn) {
        toggleFavoritesBtn.addEventListener('click', () => {
            isShowFavoritesOnly = !isShowFavoritesOnly;
            toggleFavoritesBtn.style.opacity = isShowFavoritesOnly ? '1' : '0.5';
            toggleFavoritesBtn.style.filter = isShowFavoritesOnly ? 'grayscale(0)' : 'grayscale(1)';
            renderVault();
        });
    }

    function updatePathBreadcrumb() {
        if(currentPathDisplay) {
            const displayPath = currentPath === 'uploads/' ? '/根目录' : '/根目录/' + currentPath.substring(8);
            currentPathDisplay.textContent = '当前路径: ' + displayPath;
        }
    }

    const vaultTitle = document.getElementById('vault-title');
    if(vaultTitle) {
        vaultTitle.addEventListener('click', () => {
            currentPath = 'uploads/';
            searchQuery = '';
            if(searchInput) searchInput.value = '';
            isShowFavoritesOnly = false;
            if(toggleFavoritesBtn) {
                toggleFavoritesBtn.style.opacity = '0.5';
                toggleFavoritesBtn.style.filter = 'grayscale(1)';
            }
            updatePathBreadcrumb();
            renderVault();
        });
    }

    if(newFolderBtn) {
        newFolderBtn.addEventListener('click', async () => {
            const fname = prompt('请输入新文件夹名称：');
            if(!fname) return;
            const safeName = fname.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\- ]/g, '_');
            const newPath = currentPath + safeName + '/.gitkeep';
            try {
                newFolderBtn.textContent = '创建中...';
                await fetch(`${GITHUB_API_URL}/contents/${encodeURI(newPath)}`, {
                    method: 'PUT',
                    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Create folder ${safeName}`, content: btoa('hidden') })
                });
                fetchFiles();
            } catch(e) { alert('创建文件夹失败'); }
            finally { newFolderBtn.textContent = '+ 新建文件夹'; }
        });
    }

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
            if(uploadSection) uploadSection.style.display = 'block';
            if(adminLoginBtn) adminLoginBtn.style.display = 'none';
            if(adminLogoutBtn) adminLogoutBtn.style.display = 'block';
            if(appSubtitle) appSubtitle.textContent = '安全、快速地将您的资料同步到云端。';
        } else {
            if(uploadSection) uploadSection.style.display = 'none';
            if(adminLoginBtn) adminLoginBtn.style.display = 'block';
            if(adminLogoutBtn) adminLogoutBtn.style.display = 'none';
            if(appSubtitle) appSubtitle.textContent = '高中资料共享 - 专注学习的高效书库。';
        }
        fetchFiles(); 
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

    // Initialization (Moved to end)
    function init() {
        updateAuthUI();
        if(refreshBtn) refreshBtn.addEventListener('click', () => fetchFiles());
    }

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
            const gitPath = `${currentPath}${newFilename}`;
            const putUrl = `${GITHUB_API_URL}/contents/${encodeURI(gitPath)}`;
            
            const res = await fetch(putUrl, {
                method: 'PUT',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Upload ${file.name} to ${currentPath}`,
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
        if(!refreshBtn) return;
        refreshBtn.style.opacity = '0.5';
        try {
            // Try default branch first, handle potential 404 for master/main differences
            const url = `${GITHUB_API_URL}/git/trees/${DEFAULT_BRANCH}?recursive=1`;
            const res = await fetch(url, { headers: getHeaders() });
            
            if (res.status === 401 || res.status === 403) {
                 const err = await res.json();
                 if (!getToken()) {
                    throw new Error('此仓库可能为私有，访客无权查看。请站长登录后或将仓库设为公开。');
                 }
                 throw new Error(err.message || 'GitHub API 访问被拒绝');
            }

            if (res.status === 404 || res.status === 409) {
               fullTreeData = [];
               renderVault();
               return;
            }

            if (!res.ok) throw new Error('拉取数据失败');
            const data = await res.json();
            
            // Only keep items inside 'uploads/'
            fullTreeData = data.tree ? data.tree.filter(item => item.path.startsWith('uploads/')) : [];
            renderVault();
            updatePathBreadcrumb();

        } catch (error) {
            console.error('Fetch error:', error);
            vaultContent.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--error);">
                <p>⚠️ ${error.message}</p>
                <p style="font-size: 0.8rem; margin-top: 1rem; color: var(--text-secondary);">提示：如果是权限问题，请在设置中保存有效的 Token。</p>
            </div>`;
        } finally {
            refreshBtn.style.opacity = '1';
        }
    }
    window.fetchFiles = fetchFiles; // Expose globally for metadata toggles

    // --- Delete File Logic ---
    async function deleteFile(path, sha) {
        if(!confirm(`确定要永久删除 ${path} 吗？\n删除后不可恢复！`)) return;

        const originalText = vaultContent.innerHTML;
        vaultContent.innerHTML = '<p style="text-align:center; color: var(--accent-1);">正在删除 (Deleting)...</p>';

        try {
            const res = await fetch(`${GITHUB_API_URL}/contents/${encodeURI(path)}`, {
                method: 'DELETE',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Delete ${path}`,
                    sha: sha
                })
            });

            if(!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '删除失败');
            }

            fetchFiles(); // Re-pull data

        } catch(e) {
            console.error(e);
            alert('删除失败: ' + e.message);
            vaultContent.innerHTML = originalText;
            attachVaultListeners();
        }
    }

    async function deleteFolder(folderPath) {
        // Collect all files under this folder prefix
        const targets = fullTreeData.filter(item => item.type === 'blob' && item.path.startsWith(folderPath));
        if(targets.length === 0) return;
        
        vaultContent.innerHTML = '<p style="text-align:center; color: var(--accent-1);">正在批量删除目录内容 (Deleting directory)...</p>';
        try {
            // Sequential deletion (GitHub might rate limit if doing complex parallel deletes on same branch)
            for(let file of targets) {
                const r = await fetch(`${GITHUB_API_URL}/contents/${encodeURI(file.path)}`, {
                    method: 'DELETE',
                    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Delete ${file.path}`, sha: file.sha })
                });
                if(!r.ok) console.error("Failed to delete", file.path);
            }
            fetchFiles();
        } catch(e) {
            alert('批量删除可能未完全成功: ' + e.message);
            fetchFiles();
        }
    }

    // --- Render Vault ---
    window.renderVault = function() {
        vaultContent.innerHTML = '';
        const hasToken = !!getToken();
        const meta = getMeta();
        
        let displayItems = [];
        
        if (searchQuery) {
            displayItems = fullTreeData.filter(item => {
                if(item.type !== 'blob') return false; 
                // Don't show .gitkeep
                if(item.path.endsWith('.gitkeep')) return false;
                const pathParts = item.path.split('/');
                const filename = pathParts[pathParts.length - 1].toLowerCase();
                
                if(isShowFavoritesOnly && !meta[item.sha]?.isFav) return false;
                return filename.includes(searchQuery);
            });
        } else {
            // Folder view or Flat favorites view
            if(isShowFavoritesOnly) {
                 displayItems = fullTreeData.filter(item => item.type === 'blob' && meta[item.sha]?.isFav && !item.path.endsWith('.gitkeep'));
            } else {
                displayItems = fullTreeData.filter(item => {
                    // Must start with currentPath
                    if(!item.path.startsWith(currentPath)) return false;
                    // Exclude self (if looking at a folder)
                    if(item.path === currentPath || item.path + '/' === currentPath) return false;
                    
                    // Keep only direct children
                    const relativePath = item.path.substring(currentPath.length);
                    if(relativePath.indexOf('/') > -1) {
                        return false; // it's nested deeper
                    }
                    
                    // Don't show .gitkeep
                    if(item.path.endsWith('.gitkeep')) return false;
                    return true;
                });
            }
        }
        
        // Sort: Folders first
        displayItems.sort((a, b) => {
            if (a.type === 'tree' && b.type === 'blob') return -1;
            if (a.type === 'blob' && b.type === 'tree') return 1;
            return 0; // fallback to API order
        });

        if (displayItems.length === 0) {
            vaultContent.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">没有找到相关的学习资料。</p>';
        }

        // Parent folder ".." link button
        if(currentPath !== 'uploads/' && !searchQuery && !isShowFavoritesOnly) {
            const upDiv = document.createElement('div');
            upDiv.className = 'vault-item';
            upDiv.style.cursor = 'pointer';
            upDiv.innerHTML = `<div class="file-icon">📁</div><div class="file-info"><div class="file-name">返回上一级...</div></div>`;
            upDiv.onclick = () => {
                const parts = currentPath.split('/');
                parts.pop(); // remove empty end
                parts.pop(); // remove current
                currentPath = parts.join('/') + '/';
                updatePathBreadcrumb();
                renderVault();
            };
            vaultContent.appendChild(upDiv);
        }

        const listDiv = document.createElement('div');
        listDiv.className = 'vault-list';

        displayItems.forEach(file => {
            const pathParts = file.path.split('/');
            const rawFilename = pathParts[pathParts.length - 1];
            
            if(file.type === 'tree') {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'vault-item';
                itemDiv.style.cursor = 'pointer';
                const deleteBtnHTML = hasToken ? `<button class="action-btn delete-folder-btn" data-path="${file.path}/">删除</button>` : '';
                itemDiv.innerHTML = `
                    <div class="file-icon">📁</div>
                    <div class="file-info"><div class="file-name" style="font-weight: 600;">${rawFilename}</div></div>
                    <div class="vault-actions">${deleteBtnHTML}</div>
                `;
                itemDiv.onclick = (e) => {
                    if(e.target.classList.contains('delete-folder-btn')) {
                       if(confirm(`确定删除目录 ${rawFilename} 及其全部内容？`)) {
                           deleteFolder(file.path + '/');
                       }
                       return;
                    }
                    currentPath = file.path + '/';
                    updatePathBreadcrumb();
                    renderVault();
                };
                listDiv.appendChild(itemDiv);
                return;
            }

            // RENDER FILE
            const itemDiv = document.createElement('div');
            itemDiv.className = 'vault-item';
            
            const parts = rawFilename.split('-');
            let displayName = rawFilename;
            if (parts.length > 1 && !isNaN(parts[0]) && parts[0].length === 13) {
                displayName = parts.slice(1).join('-'); 
            }
            
            const ext = displayName.substring(displayName.lastIndexOf('.'));
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}/${file.path}`;
            const fileType = getFileType(ext);
            
            let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
            let previewBtnHTML = '';
            if (fileType === 'image') {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
                previewBtnHTML = `<button class="action-btn preview-action" data-path="${cdnUrl}" data-type="image">预览</button>`;
            } else if (fileType === 'video') {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
                previewBtnHTML = `<button class="action-btn preview-action" data-path="${cdnUrl}" data-type="video">预览</button>`;
            } else if (fileType === 'pdf') {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
                previewBtnHTML = `<button class="action-btn preview-action" data-path="${cdnUrl}" data-type="pdf">预览</button>`;
            }
            
            const isFav = meta[file.sha]?.isFav;
            const comment = meta[file.sha]?.comment;

            const deleteBtnHTML = hasToken ? `<button class="action-btn delete-btn" data-path="${file.path}" data-sha="${file.sha}">删除</button>` : '';
            
            itemDiv.innerHTML = `
                <div class="file-icon">${iconSvg}</div>
                <div class="file-info">
                    <div class="file-name" title="${displayName}">${displayName}</div>
                    <div class="file-meta-row">${formatBytes(file.size)}</div>
                    ${comment ? `<div class="annotation-row"><span class="annotation-text">📝 ${comment}</span></div>` : ''}
                </div>
                <div class="vault-actions" style="margin-top:0.25rem;">
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav('${file.sha}')" title="添加或取消收藏">⭐</button>
                    <button class="action-btn comment-btn" onclick="promptComment('${file.sha}')" title="编辑学习批注">💬</button>
                    ${previewBtnHTML}
                    <a href="${cdnUrl}" target="_blank" download="${displayName}" class="action-btn">下载</a>
                    ${deleteBtnHTML}
                </div>
            `;
            listDiv.appendChild(itemDiv);
        });

        vaultContent.appendChild(listDiv);
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
                const path = e.target.getAttribute('data-path');
                const sha = e.target.getAttribute('data-sha');
                deleteFile(path, sha);
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
                
                // Account for scrollbar width and padding
                const unscaledViewport = page.getViewport({ scale: 1.0 });
                const desiredWidth = container.clientWidth - (isMobile ? 24 : 40);
                
                // Calculate display CSS scale
                const displayScale = Math.min(desiredWidth / unscaledViewport.width, 1.5); 
                
                // Get pixel ratio (handles high-DPI screens on Android/iOS natively)
                const outputScale = window.devicePixelRatio || 1;
                
                // Calculate actual render scale (CSS Scale * physical pixel ratio)
                const renderViewport = page.getViewport({ scale: displayScale * outputScale });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                // Set the physical canvas size (high resolution)
                canvas.width = renderViewport.width;
                canvas.height = renderViewport.height;
                
                // Set the visual CSS size (normal logical CSS pixels)
                canvas.style.width = (renderViewport.width / outputScale) + 'px';
                canvas.style.height = 'auto';
                canvas.style.maxWidth = '100%';
                canvas.style.display = 'block';
                canvas.style.margin = '0 auto 15px auto';
                canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                canvas.style.backgroundColor = '#fff';
                canvas.style.borderRadius = '4px';
                
                container.appendChild(canvas);
                
                const renderContext = {
                    canvasContext: context,
                    viewport: renderViewport
                };
                await page.render(renderContext).promise;
            }
        }).catch(err => {
            container.innerHTML = `<p style="color: #ffbaba; margin-top: 2rem;">文件加载或渲染失败: ${err.message}</p>`;
        });
    }

    closeModal.addEventListener('click', () => { previewModal.classList.remove('show'); previewContainer.innerHTML = ''; });
    window.addEventListener('click', (e) => { if (e.target === previewModal) { previewModal.classList.remove('show'); previewContainer.innerHTML = ''; } });

    // --- Final Execution ---
    init();
});
