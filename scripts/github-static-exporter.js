/**
 * GitHub Static Exporter
 * Production-ready client-side tool for exporting GitHub repositories as ZIP archives
 * @version 3.1.0
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
        touchStartY: 0,
        // New state for file browser
        tree: null,
        selectedFiles: new Set(),
        entryPoint: null,
        expandedFolders: new Set()
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

        // Sort branches: main/master first, then alphabetically
        const sortedBranches = this.sortBranches(branches);

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

          <div class="gh-export-search">
            <div class="gh-export-form-group">
              <input
                type="text"
                class="gh-export-input"
                id="gh-branch-search"
                placeholder="Search branches..."
                autocomplete="off"
              />
            </div>
          </div>

          <div class="gh-export-list-wrapper">
            <h3 class="gh-export-section-title">Select Branch</h3>
            <div class="gh-export-list" id="gh-branch-list">
              ${sortedBranches.map(branch => `
                <button type="button" class="gh-export-list-item" data-branch="${branch.name}">
                  <div class="gh-export-list-item-main">
                    <strong>${branch.name}</strong>
                    ${branch.name === 'main' || branch.name === 'master' ? '<span class="gh-export-badge gh-export-badge-default">default</span>' : ''}
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

    sortBranches(branches) {
      const priority = ['main', 'master'];
      return [...branches].sort((a, b) => {
        const aIndex = priority.indexOf(a.name);
        const bIndex = priority.indexOf(b.name);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;

        return a.name.localeCompare(b.name);
      });
    }

    attachBranchListHandlers() {
      const body = this.getModalBody();
      const searchInput = body.querySelector('#gh-branch-search');
      const branchItems = body.querySelectorAll('.gh-export-list-item');

      // Branch search functionality
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        branchItems.forEach(item => {
          const branchName = item.dataset.branch.toLowerCase();
          item.style.display = branchName.includes(query) ? 'flex' : 'none';
        });
      });

      body.querySelector('#gh-back').addEventListener('click', () => {
        this.state.token ? this.renderRepositoryList() : this.renderAuthScreen();
      });

      branchItems.forEach(item => {
        item.addEventListener('click', () => {
          this.state.selectedBranch = item.dataset.branch;
          this.renderFileBrowser();
        });
      });
    }

    // --------------------------------------------------------------------------
    // FILE BROWSER
    // --------------------------------------------------------------------------

    async renderFileBrowser() {
      this.showLoading('Loading files...');

      try {
        const { owner, name } = this.state.selectedRepo;
        const branch = this.state.selectedBranch;

        const tree = await this.fetchTree(owner, name, branch);
        this.state.tree = tree;

        // Filter to get only allowed files
        const staticFiles = this.filterFiles(tree);

        // Initialize selected files with all static files
        this.state.selectedFiles = new Set(staticFiles.map(f => f.path));

        // Auto-detect entry point
        this.state.entryPoint = this.detectEntryPoint(staticFiles);

        // Build folder structure
        const folderStructure = this.buildFolderStructure(staticFiles);

        // Auto-expand folders containing the entry point
        if (this.state.entryPoint) {
          this.autoExpandToPath(this.state.entryPoint);
        }

        this.renderFileBrowserUI(folderStructure, staticFiles);

      } catch (error) {
        this.renderError(`Failed to load files: ${error.message}`);
      }
    }

    detectEntryPoint(files) {
      // Priority order for entry point detection
      const entryPointNames = ['index.html', 'index.htm', 'home.html', 'default.html', 'main.html'];

      for (const name of entryPointNames) {
        // First check root level
        const rootFile = files.find(f => f.path === name);
        if (rootFile) return rootFile.path;

        // Then check any directory
        const nestedFile = files.find(f => f.path.endsWith('/' + name));
        if (nestedFile) return nestedFile.path;
      }

      // If no common entry point, return first HTML file
      const htmlFile = files.find(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
      return htmlFile ? htmlFile.path : null;
    }

    buildFolderStructure(files) {
      const structure = { files: [], folders: {} };

      files.forEach(file => {
        const parts = file.path.split('/');

        if (parts.length === 1) {
          // Root level file
          structure.files.push(file);
        } else {
          // Nested file - build folder hierarchy
          let current = structure;
          for (let i = 0; i < parts.length - 1; i++) {
            const folder = parts[i];
            if (!current.folders[folder]) {
              current.folders[folder] = { files: [], folders: {} };
            }
            current = current.folders[folder];
          }
          current.files.push(file);
        }
      });

      return structure;
    }

    autoExpandToPath(path) {
      const parts = path.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (currentPath ? '/' : '') + parts[i];
        this.state.expandedFolders.add(currentPath);
      }
    }

    renderFileBrowserUI(structure, allFiles) {
      const body = this.getModalBody();

      const selectedCount = this.state.selectedFiles.size;
      const totalCount = allFiles.length;
      const hasEntryPoint = this.state.entryPoint && this.state.selectedFiles.has(this.state.entryPoint);

      body.innerHTML = `
        <div class="gh-export-breadcrumb">
          <button type="button" class="gh-export-breadcrumb-item" id="gh-back-to-branches">
            <i class="ph ph-caret-left"></i>
            Branches
          </button>
          <span class="gh-export-breadcrumb-separator">/</span>
          <span class="gh-export-breadcrumb-item">${this.state.selectedBranch}</span>
        </div>

        <div class="gh-export-file-browser">
          <div class="gh-export-file-header">
            <div class="gh-export-file-header-left">
              <label class="gh-export-checkbox-wrapper">
                <input type="checkbox" id="gh-select-all" ${selectedCount === totalCount ? 'checked' : ''} />
                <span class="gh-export-checkbox-label">Select All</span>
              </label>
              <span class="gh-export-file-count">${selectedCount} of ${totalCount} files</span>
            </div>
            <div class="gh-export-file-header-right">
              <input
                type="text"
                class="gh-export-input gh-export-file-search"
                id="gh-file-search"
                placeholder="Filter files..."
                autocomplete="off"
              />
            </div>
          </div>

          <div class="gh-export-file-tree" id="gh-file-tree">
            ${this.renderFolderContents(structure, '')}
          </div>

          <div class="gh-export-entry-point">
            <div class="gh-export-entry-point-header">
              <i class="ph ph-house"></i>
              <span>Entry Point</span>
            </div>
            <div class="gh-export-entry-point-selector">
              <select id="gh-entry-point" class="gh-export-select">
                <option value="">No entry point</option>
                ${allFiles
                  .filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'))
                  .map(f => `<option value="${f.path}" ${f.path === this.state.entryPoint ? 'selected' : ''}>${f.path}</option>`)
                  .join('')}
              </select>
              <p class="gh-export-entry-point-hint">
                Files will be organized relative to this file's directory
              </p>
            </div>
          </div>
        </div>

        <div class="gh-export-footer">
          <button type="button" class="gh-export-button" id="gh-cancel-export">
            Cancel
          </button>
          <button type="button" class="gh-export-button gh-export-button-primary" id="gh-start-export" ${!hasEntryPoint || selectedCount === 0 ? 'disabled' : ''}>
            <i class="ph ph-download-simple"></i>
            Export ${selectedCount} Files
          </button>
        </div>
      `;

      this.attachFileBrowserHandlers(allFiles);
    }

    renderFolderContents(structure, basePath) {
      let html = '';

      // Render folders first (sorted)
      const sortedFolders = Object.keys(structure.folders).sort();
      for (const folderName of sortedFolders) {
        const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
        const isExpanded = this.state.expandedFolders.has(folderPath);
        const folderContent = structure.folders[folderName];

        // Calculate folder selection state
        const folderFiles = this.getAllFilesInFolder(folderContent);
        const selectedInFolder = folderFiles.filter(f => this.state.selectedFiles.has(f.path)).length;
        const isPartial = selectedInFolder > 0 && selectedInFolder < folderFiles.length;
        const isAllSelected = selectedInFolder === folderFiles.length;

        html += `
          <div class="gh-export-folder ${isExpanded ? 'gh-export-folder-expanded' : ''}" data-folder="${folderPath}">
            <div class="gh-export-folder-header">
              <label class="gh-export-checkbox-wrapper" onclick="event.stopPropagation()">
                <input type="checkbox" class="gh-folder-checkbox" data-folder-path="${folderPath}"
                  ${isAllSelected ? 'checked' : ''} ${isPartial ? 'data-partial="true"' : ''} />
              </label>
              <button type="button" class="gh-export-folder-toggle" data-folder="${folderPath}">
                <i class="ph ${isExpanded ? 'ph-folder-open' : 'ph-folder'}"></i>
                <span>${folderName}</span>
                <i class="ph ph-caret-${isExpanded ? 'down' : 'right'} gh-export-folder-arrow"></i>
              </button>
            </div>
            <div class="gh-export-folder-contents" ${!isExpanded ? 'style="display: none;"' : ''}>
              ${this.renderFolderContents(folderContent, folderPath)}
            </div>
          </div>
        `;
      }

      // Render files (sorted)
      const sortedFiles = [...structure.files].sort((a, b) => {
        const aName = a.path.split('/').pop();
        const bName = b.path.split('/').pop();
        return aName.localeCompare(bName);
      });

      for (const file of sortedFiles) {
        const fileName = file.path.split('/').pop();
        const isSelected = this.state.selectedFiles.has(file.path);
        const isEntryPoint = file.path === this.state.entryPoint;
        const ext = fileName.split('.').pop().toLowerCase();
        const icon = this.getFileIcon(ext);

        html += `
          <div class="gh-export-file-item ${isSelected ? 'gh-export-file-selected' : ''} ${isEntryPoint ? 'gh-export-file-entry' : ''}" data-file="${file.path}">
            <label class="gh-export-checkbox-wrapper">
              <input type="checkbox" class="gh-file-checkbox" data-path="${file.path}" ${isSelected ? 'checked' : ''} />
            </label>
            <i class="ph ${icon}"></i>
            <span class="gh-export-file-name">${fileName}</span>
            ${isEntryPoint ? '<span class="gh-export-badge gh-export-badge-entry">entry</span>' : ''}
          </div>
        `;
      }

      return html;
    }

    getAllFilesInFolder(folderContent) {
      let files = [...folderContent.files];
      for (const subfolder of Object.values(folderContent.folders)) {
        files = files.concat(this.getAllFilesInFolder(subfolder));
      }
      return files;
    }

    getFileIcon(ext) {
      const icons = {
        html: 'ph-file-html',
        htm: 'ph-file-html',
        css: 'ph-file-css',
        js: 'ph-file-js',
        json: 'ph-file-js',
        png: 'ph-file-image',
        jpg: 'ph-file-image',
        jpeg: 'ph-file-image',
        gif: 'ph-file-image',
        svg: 'ph-file-svg',
        webp: 'ph-file-image',
        ico: 'ph-file-image',
        pdf: 'ph-file-pdf',
        md: 'ph-file-text',
        txt: 'ph-file-text',
        xml: 'ph-file-code',
        woff: 'ph-text-aa',
        woff2: 'ph-text-aa',
        ttf: 'ph-text-aa',
        otf: 'ph-text-aa',
        eot: 'ph-text-aa',
        mp4: 'ph-file-video',
        webm: 'ph-file-video',
        ogg: 'ph-file-audio',
        mp3: 'ph-file-audio',
        wav: 'ph-file-audio'
      };
      return icons[ext] || 'ph-file';
    }

    attachFileBrowserHandlers(allFiles) {
      const body = this.getModalBody();

      // Back to branches
      body.querySelector('#gh-back-to-branches').addEventListener('click', () => {
        this.state.selectedFiles.clear();
        this.state.expandedFolders.clear();
        this.state.entryPoint = null;
        this.renderBranchList();
      });

      // Select all toggle
      body.querySelector('#gh-select-all').addEventListener('change', (e) => {
        if (e.target.checked) {
          allFiles.forEach(f => this.state.selectedFiles.add(f.path));
        } else {
          this.state.selectedFiles.clear();
        }
        this.refreshFileBrowser(allFiles);
      });

      // File search/filter
      body.querySelector('#gh-file-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        body.querySelectorAll('.gh-export-file-item').forEach(item => {
          const fileName = item.querySelector('.gh-export-file-name').textContent.toLowerCase();
          const filePath = item.dataset.file.toLowerCase();
          const matches = fileName.includes(query) || filePath.includes(query);
          item.style.display = matches ? 'flex' : 'none';
        });

        // Show/hide folders based on whether they have visible children
        body.querySelectorAll('.gh-export-folder').forEach(folder => {
          const hasVisibleChildren = folder.querySelectorAll('.gh-export-file-item[style="display: flex;"], .gh-export-file-item:not([style])').length > 0;
          folder.style.display = hasVisibleChildren || query === '' ? 'block' : 'none';
        });
      });

      // Folder toggles
      body.querySelectorAll('.gh-export-folder-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
          const folderPath = toggle.dataset.folder;
          const folder = toggle.closest('.gh-export-folder');
          const contents = folder.querySelector('.gh-export-folder-contents');
          const icon = toggle.querySelector('.ph-folder, .ph-folder-open');
          const arrow = toggle.querySelector('.gh-export-folder-arrow');

          if (this.state.expandedFolders.has(folderPath)) {
            this.state.expandedFolders.delete(folderPath);
            contents.style.display = 'none';
            folder.classList.remove('gh-export-folder-expanded');
            icon.classList.replace('ph-folder-open', 'ph-folder');
            arrow.classList.replace('ph-caret-down', 'ph-caret-right');
          } else {
            this.state.expandedFolders.add(folderPath);
            contents.style.display = 'block';
            folder.classList.add('gh-export-folder-expanded');
            icon.classList.replace('ph-folder', 'ph-folder-open');
            arrow.classList.replace('ph-caret-right', 'ph-caret-down');
          }
        });
      });

      // Folder checkboxes
      body.querySelectorAll('.gh-folder-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const folderPath = e.target.dataset.folderPath;
          const folder = e.target.closest('.gh-export-folder');
          const fileCheckboxes = folder.querySelectorAll('.gh-file-checkbox');

          fileCheckboxes.forEach(cb => {
            if (e.target.checked) {
              this.state.selectedFiles.add(cb.dataset.path);
            } else {
              this.state.selectedFiles.delete(cb.dataset.path);
            }
          });

          this.refreshFileBrowser(allFiles);
        });
      });

      // Individual file checkboxes
      body.querySelectorAll('.gh-file-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.state.selectedFiles.add(e.target.dataset.path);
          } else {
            this.state.selectedFiles.delete(e.target.dataset.path);
          }
          this.refreshFileBrowser(allFiles);
        });
      });

      // Entry point selector
      body.querySelector('#gh-entry-point').addEventListener('change', (e) => {
        this.state.entryPoint = e.target.value || null;
        this.refreshFileBrowser(allFiles);
      });

      // Cancel button
      body.querySelector('#gh-cancel-export').addEventListener('click', () => {
        this.closeModal();
      });

      // Export button
      body.querySelector('#gh-start-export').addEventListener('click', () => {
        this.startExportWithSelection();
      });
    }

    refreshFileBrowser(allFiles) {
      const staticFiles = this.filterFiles(this.state.tree);
      const folderStructure = this.buildFolderStructure(staticFiles);
      this.renderFileBrowserUI(folderStructure, allFiles);
    }

    async startExportWithSelection() {
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

        // Get files from selection
        const selectedPaths = Array.from(this.state.selectedFiles);
        const tree = this.state.tree;
        const selectedFiles = tree.filter(item =>
          item.type === 'blob' && selectedPaths.includes(item.path)
        );

        if (selectedFiles.length === 0) {
          throw new Error('No files selected');
        }

        // Use custom entry point or detect one
        const entryPoint = this.state.entryPoint;
        if (!entryPoint) {
          throw new Error('No entry point selected');
        }

        const rootPath = this.getRootPath(entryPoint);

        this.updateProgress(50, 'Downloading files...');
        const files = await this.fetchFiles(owner, name, branch, selectedFiles, rootPath);

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
      // Fetch all branches with pagination (GitHub defaults to 30 per page)
      const allBranches = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const branches = await this.apiRequest(
          `/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`
        );

        allBranches.push(...branches);

        // If we got fewer than perPage, we've reached the end
        if (branches.length < perPage) break;
        page++;
      }

      return allBranches;
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
