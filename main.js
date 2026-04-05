document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadsContainer = document.getElementById('uploads-container');
    const vaultContent = document.getElementById('vault-content');
    const refreshBtn = document.getElementById('refresh-btn');
    const previewModal = document.getElementById('preview-modal');
    const closeModal = document.querySelector('.close-modal');
    const previewContainer = document.getElementById('preview-container');

    // --- GitHub Configuration ---
    const GITHUB_TOKEN = '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';
    const GITHUB_OWNER = 'Blueoegg';
    const GITHUB_REPO = 'senior';
    
    const REPO_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/uploads`;
    const getHeaders = () => ({
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
    });

    // Determine File Type
    function getFileType(ext) {
        ext = ext.toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
        if (['.mp4', '.webm', '.ogg'].includes(ext)) return 'video';
        return 'file';
    }

    // Convert file to Base64 (needed for GitHub PUT)
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]); // return just the raw base64 string
            reader.onerror = error => reject(error);
        });
    }

    // Format bytes
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0 || !bytes) return '未知大小'; // GitHub API doesn't easily give direct size in kb, it gives sha size sometimes, but we estimate or extract
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Initial fetch
    fetchFiles();
    refreshBtn.addEventListener('click', fetchFiles);

    // --- Drag and Drop Logic ---
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

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleFiles(files) {
        ([...files]).forEach(uploadFile);
    }

    async function uploadFile(file) {
        const fileId = 'file-' + Math.random().toString(36).substr(2, 9);
        const fileItem = document.createElement('div');
        fileItem.className = 'upload-item';
        fileItem.id = fileId;

        // Visual creation
        fileItem.innerHTML = `
            <div class="file-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
            </div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-status-row">
                    <span class="file-size">${formatBytes(file.size)}</span>
                    <span class="file-percentage" id="pct-${fileId}">上传中...</span>
                </div>
            </div>
            <div class="status-icon" id="status-${fileId}"></div>
        `;

        uploadsContainer.prepend(fileItem);
        const statusIconContainer = document.getElementById(`status-${fileId}`);

        try {
            // Encode the timestamp into the filename so we can sort/group files later!
            const timestamp = Date.now();
            let rawBaseName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.\-_]/g, '_');
            const newFilename = `${timestamp}-${rawBaseName}`;
            
            const base64Content = await fileToBase64(file);
            
            const putUrl = `${REPO_API_URL}/${encodeURIComponent(newFilename)}`;
            
            // Push directly to GitHub!
            const res = await fetch(putUrl, {
                method: 'PUT',
                headers: {
                    ...getHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Upload ${file.name} via QuantumDrop Frontend`,
                    content: base64Content,
                    // Optionally set branch if not main
                    // branch: 'main'
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || '上传失败啦');
            }

            statusIconContainer.innerHTML = `<span style="color:var(--success)">完成</span>`;
            document.getElementById(`pct-${fileId}`).textContent = '100%';
            
            // Refresh vault smoothly
            setTimeout(fetchFiles, 1500);
            setTimeout(() => fileItem.remove(), 4000);

        } catch (error) {
            console.error('Upload Error:', error);
            document.getElementById(`pct-${fileId}`).textContent = '失败';
            document.getElementById(`pct-${fileId}`).style.color = 'var(--error)';
            statusIconContainer.innerHTML = `<span style="color:var(--error)">错误</span>`;
        }
    }

    // --- Fetch Logic (List Files) ---
    async function fetchFiles() {
        refreshBtn.style.opacity = '0.5';
        try {
            const res = await fetch(REPO_API_URL, { headers: getHeaders() });
            
            if (res.status === 404) {
               // The uploads folder might not exist yet, that's fine.
               renderVault([]);
               return;
            }

            if (!res.ok) throw new Error('拉取失败');
            const data = await res.json();
            
            const fileRecords = data
                .filter(item => item.type === 'file')
                .map(item => {
                    // Extract our encoded timestamp from filename: e.g. "1712411234123-image.jpg"
                    const parts = item.name.split('-');
                    let timeMs = 0;
                    let displayName = item.name;
                    
                    if (parts.length > 1 && !isNaN(parts[0]) && parts[0].length === 13) {
                        timeMs = parseInt(parts[0]);
                        displayName = parts.slice(1).join('-'); // remove timestamp for display
                    } else {
                        // fallback if no timestamp encoded
                        timeMs = 0; 
                    }

                    const ext = displayName.substring(displayName.lastIndexOf('.'));
                    
                    // jsdelivr url target
                    const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}/${item.path}`;

                    return {
                        name: displayName,
                        size: item.size, // this is github size (approx base64 or raw limits), but better than nothing
                        timeMs: timeMs,
                        path: cdnUrl,
                        type: getFileType(ext)
                    };
                });

            // Recreate grouping logically
            fileRecords.sort((a, b) => b.timeMs - a.timeMs);

            const grouped = [];
            let currentGroup = null;

            const now = new Date();
            const todayStr = now.toDateString();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();

            fileRecords.forEach(file => {
                let groupLabel = '早期文件';
                
                if (file.timeMs > 0) {
                    const fileDate = new Date(file.timeMs);
                    const fileDateStr = fileDate.toDateString();
                    
                    if (fileDateStr === todayStr) {
                        groupLabel = '今天';
                    } else if (fileDateStr === yesterdayStr) {
                        groupLabel = '昨天';
                    } else {
                        groupLabel = `${fileDate.getFullYear()}年${fileDate.getMonth() + 1}月${fileDate.getDate()}日`;
                    }
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
            vaultContent.innerHTML = '<p style="text-align:center;color:var(--error);">无法连接到 GitHub</p>';
        } finally {
            refreshBtn.style.opacity = '1';
        }
    }

    function renderVault(groupedFiles) {
        if (!groupedFiles || groupedFiles.length === 0) {
            vaultContent.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无文件，快去上传吧！</p>';
            return;
        }

        vaultContent.innerHTML = '';
        
        groupedFiles.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'date-group';
            
            const groupTitle = document.createElement('div');
            groupTitle.className = 'date-group-title';
            groupTitle.textContent = group.label;
            groupDiv.appendChild(groupTitle);

            const listDiv = document.createElement('div');
            listDiv.className = 'vault-list';

            group.files.forEach(file => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'vault-item';
                
                let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
                
                let previewBtnHTML = '';
                if (file.type === 'image' || file.type === 'video') {
                    if (file.type === 'image') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
                    if (file.type === 'video') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
                    
                    previewBtnHTML = `<button class="action-btn preview-action" data-path="${file.path}" data-type="${file.type}">预览</button>`;
                }

                itemDiv.innerHTML = `
                    <div class="file-icon">${iconSvg}</div>
                    <div class="file-info">
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-meta-row">${formatBytes(file.size)}</div>
                    </div>
                    <div class="vault-actions">
                        ${previewBtnHTML}
                        <a href="${file.path}" target="_blank" download="${file.name}" class="action-btn">下载/外链</a>
                    </div>
                `;
                listDiv.appendChild(itemDiv);
            });

            groupDiv.appendChild(listDiv);
            vaultContent.appendChild(groupDiv);
        });

        document.querySelectorAll('.preview-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const path = e.target.getAttribute('data-path');
                const type = e.target.getAttribute('data-type');
                openPreview(path, type);
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
        }
        previewModal.classList.add('show');
    }

    closeModal.addEventListener('click', () => {
        previewModal.classList.remove('show');
        previewContainer.innerHTML = ''; 
    });

    window.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            previewModal.classList.remove('show');
            previewContainer.innerHTML = '';
        }
    });
});
