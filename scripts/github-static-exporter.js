/**
 * GitHub Static Exporter
 * Production-ready client-side tool for exporting GitHub repositories as ZIP archives
 * @version 3.0.1
 * @license MIT
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    API: {
      BASE_URL: 'https://api.github.com',
      ACCEPT_HEADER: 'application/vnd.github.v3+json'
    },
    STORAGE: {
      TOKEN_KEY: 'gh_exporter_token'
    },
    EXPORT: {
      BATCH_SIZE: 10,
      COMPRESSION_LEVEL: 6
    },
    FILTERS: {
      EXCLUDED_DIRECTORIES: [
        '/src',
        '/node_modules',
        '/tests',
        '/test',
        '/.github',
        '/dist',
        '/build',
        '/.git',
        '/coverage',
        '/__tests__',
        '/spec',
        '/.vscode',
        '/.idea',
        '/vendor',
        '/packages'
      ],
      EXCLUDED_FILES: [
        '.gitignore',
        '.gitattributes',
        'package.json',
        'package-lock.json',
        'yarn.lock',
        'composer.json',
        'composer.lock',
        'Gemfile',
        'Gemfile.lock',
        '.npmrc',
        '.nvmrc',
        'tsconfig.json',
        'webpack.config.js',
        'rollup.config.js',
        'vite.config.js',
        '.babelrc',
        '.eslintrc',
        '.prettierrc',
        'jest.config.js',
        '.travis.yml',
        '.gitlab-ci.yml',
        'Dockerfile',
        'docker-compose.yml',
        'Makefile',
        'Rakefile',
        'gulpfile.js',
        'Gruntfile.js'
      ],
      ALLOWED_EXTENSIONS: [
        'html', 'htm', 'css', 'js', 'json', 'xml', 'txt',
        'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico',
        'woff', 'woff2', 'ttf', 'otf', 'eot',
        'mp4', 'webm', 'ogg', 'mp3', 'wav',
        'pdf', 'md'
      ]
    }
  };

  // ============================================================================
  // MAIN CLASS
  // ============================================================================

  class GitHubStaticExporter {

    constructor() {
      this.state = {
        token: localStorage.getItem(CONFIG.STORAGE.TOKEN_KEY),
        targetInput: null,
        selectedRepo: null,
        selectedBranch: null,
        modal: null,
        touchStartY: 0
      };

      this.initialize();
    }

    // --------------------------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------------------------

    initialize() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.attachToInputs());
      } else {
        this.attachToInputs();
      }
    }

    attachToInputs() {
      const inputs = document.querySelectorAll(
        'input[type="file"][data-gh-export], input[type="file"][data-gh-export-fab]'
      );

      inputs.forEach(input => {
        if (input.dataset.ghAttached) return;

        const isFAB = input.hasAttribute('data-gh-export-fab');

        if (isFAB) {
          this.createFloatingButton(input);
        } else {
          this.createInlineButton(input);
        }

        input.dataset.ghAttached = 'true';
      });
    }

    createInlineButton(input) {
      const wrapper = document.createElement('div');
      wrapper.className = 'gh-export-wrapper';

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const button = this.createButton('Select from GitHub', false);
      button.addEventListener('click', () => this.openExporter(input));

      wrapper.appendChild(button);
    }

    createFloatingButton(input) {
      const button = this.createButton('Select from GitHub', true);
      button.addEventListener('click', () => this.openExporter(input));

      document.body.appendChild(button);
      input.dataset.fabId = button.id = `gh-fab-${Date.now()}`;
    }

    createButton(text, isFAB) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = isFAB ? 'gh-export-fab' : 'gh-export-trigger';
      button.innerHTML = `
        <i class="ph ph-github-logo"></i>
        <span class="${isFAB ? 'gh-export-fab-text' : 'gh-export-trigger-text'}">${text}</span>
      `;
      button.setAttribute('aria-label', text);
      return button;
    }

    // --------------------------------------------------------------------------
    // MODAL MANAGEMENT
    // --------------------------------------------------------------------------

    openExporter(targetInput) {
      this.state.targetInput = targetInput;
      this.createModal();
      this.renderAuthScreen();
    }

    createModal() {
      if (this.state.modal) {
        this.state.modal.remove();
      }

      const modal = document.createElement('div');
      modal.className = 'gh-export-modal';
      modal.innerHTML = `
        <div class="gh-export-overlay"></div>
        <div class="gh-export-content">
          <div class="gh-export-handle"></div>
          <div class="gh-export-header">
            <h2 class="gh-export-title">Export from GitHub</h2>
            <button type="button" class="gh-export-close" aria-label="Close">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="gh-export-body"></div>
        </div>
      `;

      document.body.appendChild(modal);
      this.state.modal = modal;

      this.attachModalHandlers();
      this.preventBodyScroll(true);
    }

    attachModalHandlers() {
      const modal = this.state.modal;

      modal.querySelector('.gh-export-close')
        .addEventListener('click', () => this.closeModal());

      modal.querySelector('.gh-export-overlay')
        .addEventListener('click', () => this.closeModal());

      this.attachSwipeGesture(modal);
      this.attachFocusTrap(modal);
    }

    attachSwipeGesture(modal) {
      const content = modal.querySelector('.gh-export-content');
      const handle = modal.querySelector('.gh-export-handle');

      handle.addEventListener('touchstart', (e) => {
        this.state.touchStartY = e.touches[0].clientY;
      }, { passive: true });

      handle.addEventListener('touchmove', (e) => {
        const diff = e.touches[0].clientY - this.state.touchStartY;
        if (diff > 0) {
          content.style.transform = `translateY(${diff}px)`;
        }
      }, { passive: true });

      handle.addEventListener('touchend', (e) => {
        const diff = e.changedTouches[0].clientY - this.state.touchStartY;
        if (diff > 100) {
          this.closeModal();
        } else {
          content.style.transform = '';
        }
      }, { passive: true });
    }

    attachFocusTrap(modal) {
      const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeModal();
        }

        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });

      first?.focus();
    }

    closeModal() {
      if (this.state.modal) {
        this.state.modal.remove();
        this.state.modal = null;
        this.preventBodyScroll(false);
      }
    }

    preventBodyScroll(prevent) {
      document.body.style.overflow = prevent ? 'hidden' : '';
    }

    getModalBody() {
      return this.state.modal?.querySelector('.gh-export-body');
    }

    // --------------------------------------------------------------------------
    // SCREEN RENDERING
    // --------------------------------------------------------------------------

    renderAuthScreen() {
      const body = this.getModalBody();
      if (!body) return;

      if (this.state.token) {
        this.renderRepositoryList();
        return;
      }

      body.innerHTML = `
        <div class="gh-export-auth">
          <div class="gh-export-section">
            <h3 class="gh-export-section-title">Public Repository</h3>
            <p class="gh-export-section-desc">
              Export any public GitHub repository by URL.
            </p>
            <div class="gh-export-form-group">
              <label class="gh-export-label" for="gh-repo-url">Repository URL</label>
              <input
                type="text"
                class="gh-export-input"
                id="gh-repo-url"
                placeholder="https://github.com/username/repository"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <button type="button" class="gh-export-button gh-export-button-primary" id="gh-fetch-public">
              Continue
            </button>
          </div>

          <div class="gh-export-divider">
            <span>or</span>
          </div>

          <div class="gh-export-section">
            <h3 class="gh-export-section-title">Private Repository</h3>
            <p class="gh-export-section-desc">
              Authenticate with a Personal Access Token to access private repos.
              <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener">Create token</a>
            </p>
            <div class="gh-export-form-group">
              <label class="gh-export-label" for="gh-token">Personal Access Token</label>
              <input
                type="password"
                class="gh-export-input"
                id="gh-token"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <button type="button" class="gh-export-button gh-export-button-primary" id="gh-save-token">
              Authenticate
            </button>
          </div>
        </div>
      `;

      this.attachAuthHandlers();
    }

    attachAuthHandlers() {
      const body = this.getModalBody();

      body.querySelector('#gh-fetch-public').addEventListener('click', () => {
        const url = body.querySelector('#gh-repo-url').value.trim();
        this.handlePublicRepo(url);
      });

      body.querySelector('#gh-save-token').addEventListener('click', () => {
        const token = body.querySelector('#gh-token').value.trim();
        this.handleTokenSave(token);
      });

      body.querySelector('#gh-repo-url').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') body.querySelector('#gh-fetch-public').click();
      });

      body.querySelector('#gh-token').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') body.querySelector('#gh-save-token').click();
      });
    }

    async handlePublicRepo(url) {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        this.showNotification('Invalid GitHub URL format', 'error');
        return;
      }

      const [, owner, repo] = match;
      this.state.selectedRepo = {
        owner,
        name: repo.replace(/\.git$/, ''),
        full_name: `${owner}/${repo}`
      };

      await this.renderBranchList();
    }

    handleTokenSave(token) {
      if (!token) {
        this.showNotification('Please enter a valid token', 'error');
        return;
      }

      this.state.token = token;
      localStorage.setItem(CONFIG.STORAGE.TOKEN_KEY, token);
      this.renderRepositoryList();
    }

    async renderRepositoryList() {
      this.showLoading('Loading repositories...');

      try {
        const repos = await this.fetchRepositories();

        const body = this.getModalBody();
        body.innerHTML = `
          <div class="gh-export-search">
            <div class="gh-export-form-group">
              <input
                type="text"
                class="gh-export-input"
                id="gh-repo-search"
                placeholder="Search repositories..."
                autocomplete="off"
              />
            </div>
          </div>
          <div class="gh-export-list-wrapper">
            <div class="gh-export-list" id="gh-repo-list">
              ${repos.map(repo => `
                <button
                  type="button"
                  class="gh-export-list-item"
                  data-repo='${JSON.stringify({
                    owner: repo.owner.login,
                    name: repo.name,
                    full_name: repo.full_name
                  })}'
                >
                  <div class="gh-export-list-item-main">
                    <strong>${repo.name}</strong>
                    <span class="gh-export-list-item-meta">${repo.full_name}</span>
                  </div>
                  ${repo.private ? '<span class="gh-export-badge">Private</span>' : ''}
                  <i class="ph ph-caret-right"></i>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="gh-export-footer">
            <button type="button" class="gh-export-button" id="gh-logout">
              <i class="ph ph-sign-out"></i>
              Sign Out
            </button>
          </div>
        `;

        this.attachRepoListHandlers();

      } catch (error) {
        this.renderError(`Failed to load repositories: ${error.message}`);
      }
    }

    attachRepoListHandlers() {
      const body = this.getModalBody();
      const searchInput = body.querySelector('#gh-repo-search');
      const repoItems = body.querySelectorAll('.gh-export-list-item');

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        repoItems.forEach(item => {
          const repo = JSON.parse(item.dataset.repo);
          item.style.display = repo.full_name.toLowerCase().includes(query) ? 'flex' : 'none';
        });
      });

      repoItems.forEach(item => {
        item.addEventListener('click', () => {
          this.state.selectedRepo = JSON.parse(item.dataset.repo);
          this.renderBranchList();
        });
      });

      body.querySelector('#gh-logout').addEventListener('click', () => {
        localStorage.removeItem(CONFIG.STORAGE.TOKEN_KEY);
        this.state.token = null;
        this.renderAuthScreen();
      });
    }

    async renderBranchList() {
      this.showLoading('Loading branches...');

      try {
        const branches = await this.fetchBranches(
          this.state.selectedRepo.owner,
          this.state.selectedRepo.name
        );

        const body = this.getModalBody();
        body.innerHTML = `
          <div class="gh-export-breadcrumb">
            <button type="button" class="gh-export-breadcrumb-item" id="gh-back">
              <i class="ph ph-caret-left"></i>
              ${this.state.token ? 'Repositories' : 'Back'}
            </button>
            <span class="gh-export-breadcrumb-separator">/</span>
            <span class="gh-export-breadcrumb-item">${this.state.selectedRepo.name}</span>
          </div>

          <div class="gh-export-list-wrapper">
            <h3 class="gh-export-section-title">Select Branch</h3>
            <div class="gh-export-list">
              ${branches.map(branch => `
                <button type="button" class="gh-export-list-item" data-branch="${branch.name}">
                  <div class="gh-export-list-item-main">
                    <strong>${branch.name}</strong>
                  </div>
                  <i class="ph ph-caret-right"></i>
                </button>
              `).join('')}
            </div>
          </div>
        `;

        this.attachBranchListHandlers();

      } catch (error) {
        this.renderError(`Failed to load branches: ${error.message}`);
      }
    }

    attachBranchListHandlers() {
      const body = this.getModalBody();

      body.querySelector('#gh-back').addEventListener('click', () => {
        this.state.token ? this.renderRepositoryList() : this.renderAuthScreen();
      });

      body.querySelectorAll('[data-branch]').forEach(item => {
        item.addEventListener('click', () => {
          this.state.selectedBranch = item.dataset.branch;
          this.startExport();
        });
      });
    }

    showLoading(message) {
      const body = this.getModalBody();
      if (!body) return;

      body.innerHTML = `
        <div class="gh-export-loading">
          <div class="gh-export-spinner"></div>
          <p>${message}</p>
        </div>
      `;
    }

    renderError(message) {
      const body = this.getModalBody();
      if (!body) return;

      body.innerHTML = `
        <div class="gh-export-error">
          <i class="ph-fill ph-warning-circle"></i>
          <h3>Error</h3>
          <p>${message}</p>
        </div>
        <div class="gh-export-footer">
          <button type="button" class="gh-export-button gh-export-button-primary" id="gh-back-btn">
            Go Back
          </button>
        </div>
      `;

      body.querySelector('#gh-back-btn').addEventListener('click', () => {
        this.renderAuthScreen();
      });
    }

    renderSuccess(zipBlob, filename) {
      const body = this.getModalBody();
      if (!body) return;

      body.innerHTML = `
        <div class="gh-export-success">
          <i class="ph-fill ph-check-circle"></i>
          <h3>Export Complete</h3>
          <p>Your ZIP archive is ready and attached to the file input.</p>
          <div class="gh-export-file-info">
            <strong>${filename}</strong>
            <span>${this.formatBytes(zipBlob.size)}</span>
          </div>
        </div>
        <div class="gh-export-footer">
          <button type="button" class="gh-export-button" id="gh-download">
            <i class="ph ph-download-simple"></i>
            Download
          </button>
          <button type="button" class="gh-export-button gh-export-button-primary" id="gh-done">
            Done
          </button>
        </div>
      `;

      body.querySelector('#gh-download').addEventListener('click', () => {
        this.downloadFile(zipBlob, filename);
      });

      body.querySelector('#gh-done').addEventListener('click', () => {
        this.closeModal();
      });
    }

    // --------------------------------------------------------------------------
    // EXPORT PROCESS
    // --------------------------------------------------------------------------

    async startExport() {
      const body = this.getModalBody();
      body.innerHTML = `
        <div class="gh-export-loading">
          <div class="gh-export-spinner"></div>
          <p>Preparing export...</p>
          <div class="gh-export-progress">
            <div class="gh-export-progress-bar" id="gh-progress"></div>
          </div>
          <p class="gh-export-progress-text" id="gh-status">Initializing...</p>
        </div>
      `;

      try {
        const { owner, name } = this.state.selectedRepo;
        const branch = this.state.selectedBranch;

        this.updateProgress(10, 'Fetching repository tree...');
        const tree = await this.fetchTree(owner, name, branch);

        this.updateProgress(30, 'Filtering static files...');
        const staticFiles = this.filterFiles(tree);

        if (staticFiles.length === 0) {
          throw new Error('No static files found');
        }

        const indexFile = staticFiles.find(f =>
          f.path === 'index.html' || f.path.endsWith('/index.html')
        );

        if (!indexFile) {
          throw new Error('No index.html found');
        }

        const rootPath = this.getRootPath(indexFile.path);

        this.updateProgress(50, 'Downloading files...');
        const files = await this.fetchFiles(owner, name, branch, staticFiles, rootPath);

        this.updateProgress(80, 'Creating ZIP archive...');
        const zipBlob = await this.createZip(files);

        this.updateProgress(100, 'Complete!');

        const filename = `${name}.zip`;
        await this.attachToInput(zipBlob, filename);

        this.renderSuccess(zipBlob, filename);

      } catch (error) {
        this.renderError(`Export failed: ${error.message}`);
      }
    }

    updateProgress(percent, status) {
      const bar = document.getElementById('gh-progress');
      const text = document.getElementById('gh-status');

      if (bar) bar.style.width = `${percent}%`;
      if (text) text.textContent = status;
    }

    filterFiles(tree) {
      return tree.filter(item => {
        if (item.type !== 'blob') return false;

        // Check excluded directories
        for (const dir of CONFIG.FILTERS.EXCLUDED_DIRECTORIES) {
          if (item.path.startsWith(dir.slice(1)) || item.path.includes(dir)) {
            return false;
          }
        }

        // Check excluded files
        const filename = item.path.split('/').pop();
        if (CONFIG.FILTERS.EXCLUDED_FILES.includes(filename)) {
          return false;
        }

        // Check allowed extensions
        const ext = item.path.split('.').pop().toLowerCase();
        return CONFIG.FILTERS.ALLOWED_EXTENSIONS.includes(ext) || !item.path.includes('.');
      });
    }

    getRootPath(indexPath) {
      const parts = indexPath.split('/');
      return parts.length === 1 ? '' : parts.slice(0, -1).join('/') + '/';
    }

    async fetchFiles(owner, repo, branch, files, rootPath) {
      const results = [];
      const batchSize = CONFIG.EXPORT.BATCH_SIZE;

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const promises = batch.map(async file => {
          try {
            const data = await this.apiRequest(
              `/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`
            );

            // Properly decode content based on file type
            let content;
            if (data.content) {
              if (this.isBinaryFile(file.path)) {
                // Binary files: decode base64 to Uint8Array
                content = this.base64ToUint8Array(data.content);
              } else {
                // Text files: decode base64 to UTF-8 string
                content = this.base64ToUtf8(data.content);
              }
            } else {
              content = '';
            }

            let path = file.path;

            if (rootPath && path.startsWith(rootPath)) {
              path = path.slice(rootPath.length);
            }

            return { path, content, type: file.type };
          } catch (error) {
            console.warn(`Failed to fetch ${file.path}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(promises);
        results.push(...batchResults.filter(r => r !== null));

        const progress = 50 + Math.floor((i / files.length) * 30);
        this.updateProgress(progress, `Downloading (${i + batch.length}/${files.length})...`);
      }

      return results;
    }

    async createZip(files) {
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded');
      }

      const zip = new JSZip();
      files.forEach(file => zip.file(file.path, file.content));

      return await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: CONFIG.EXPORT.COMPRESSION_LEVEL }
      });
    }

    async attachToInput(blob, filename) {
      const file = new File([blob], filename, { type: 'application/zip' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      if (this.state.targetInput) {
        this.state.targetInput.files = dataTransfer.files;
        this.state.targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    downloadFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // --------------------------------------------------------------------------
    // GITHUB API
    // --------------------------------------------------------------------------

    async apiRequest(endpoint) {
      const url = `${CONFIG.API.BASE_URL}${endpoint}`;
      const headers = { 'Accept': CONFIG.API.ACCEPT_HEADER };

      if (this.state.token) {
        headers['Authorization'] = `token ${this.state.token}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `API error: ${response.status}`);
      }

      return await response.json();
    }

    async fetchRepositories() {
      return await this.apiRequest('/user/repos?per_page=100&sort=updated');
    }

    async fetchBranches(owner, repo) {
      return await this.apiRequest(`/repos/${owner}/${repo}/branches`);
    }

    async fetchTree(owner, repo, branch) {
      const ref = await this.apiRequest(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
      const commit = await this.apiRequest(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
      const tree = await this.apiRequest(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
      return tree.tree;
    }

    // --------------------------------------------------------------------------
    // UTILITIES
    // --------------------------------------------------------------------------

    isBinaryFile(path) {
      const binaryExtensions = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico',
        'woff', 'woff2', 'ttf', 'otf', 'eot',
        'mp4', 'webm', 'ogg', 'mp3', 'wav',
        'pdf', 'zip', 'tar', 'gz'
      ];
      const ext = path.split('.').pop().toLowerCase();
      return binaryExtensions.includes(ext);
    }

    base64ToUtf8(base64) {
      // Remove whitespace and newlines from base64 string
      const cleanBase64 = base64.replace(/\s/g, '');

      // Decode base64 to binary string
      const binaryString = atob(cleanBase64);

      // Convert binary string to UTF-8
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode UTF-8 bytes to string
      return new TextDecoder('utf-8').decode(bytes);
    }

    base64ToUint8Array(base64) {
      // Remove whitespace and newlines from base64 string
      const cleanBase64 = base64.replace(/\s/g, '');

      // Decode base64 to binary string
      const binaryString = atob(cleanBase64);

      // Convert to Uint8Array for binary files
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes;
    }

    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    }

    showNotification(message, type = 'info') {
      console.warn(`[GitHub Exporter] ${type.toUpperCase()}: ${message}`);
    }
  }

  // ============================================================================
  // AUTO-INITIALIZE
  // ============================================================================

  if (typeof window !== 'undefined') {
    window.GitHubStaticExporter = GitHubStaticExporter;
    window.ghExporter = new GitHubStaticExporter();
  }

})();
