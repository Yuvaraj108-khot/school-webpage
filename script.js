document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════════════
    // Render Unified Header
    // ═══════════════════════════════════════════════
    const headerEl = document.querySelector('.site-header');
    if (headerEl) {
        const path = window.location.pathname;
        const page = path.split("/").pop().toLowerCase() || "index.html";
        const isHome = page === 'index.html' || page === '' || page === 'index';
        const isAbout = page === 'about.html' || page === 'about';
        const isAcademics = page === 'academics.html' || page === 'academics';
        const isTeachers = page === 'teachers.html' || page === 'teachers';
        const isAdmission = page === 'admission.html' || page === 'admission';
        const isGallery = page === 'gallery.html' || page === 'gallery';
        const isAlumni = page === 'alumni.html' || page === 'alumni';
        const isContact = page === 'contact.html' || page === 'contact';

        headerEl.innerHTML = `
            <div class="container header-container">
                <div class="logo">
                    <img src="images/logo.png" alt="SBS Logo">
                    <div class="logo-text">
                        <h1>SBS KARKALA</h1>
                        <span>Shaping Global Futures</span>
                    </div>
                </div>
                <div class="menu-toggle">
                    <i class="fas fa-bars"></i>
                </div>
                <nav class="nav-menu">
                    <a href="index.html" class="${isHome ? 'active' : ''}">Home</a>
                    <a href="about.html" class="${isAbout ? 'active' : ''}">About</a>
                    <a href="academics.html" class="${isAcademics ? 'active' : ''}">Academics</a>
                    <a href="teachers.html" class="${isTeachers ? 'active' : ''}">Teachers</a>
                    <a href="admission.html" class="${isAdmission ? 'active' : ''}">Admission</a>
                    <a href="gallery.html" class="${isGallery ? 'active' : ''}">Gallery</a>
                    <a href="alumni.html" class="${isAlumni ? 'active' : ''}">Alumni</a>
                    <a href="contact.html" class="${isContact ? 'active' : ''}">Contact</a>
                </nav>
                <div class="nav-buttons">
                    <a href="login.html" class="btn btn-primary">Login</a>
                    <a href="admission.html" class="btn btn-primary">Apply</a>
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════
    // Premium Slide-in Sidebar Navigation Logic
    // ═══════════════════════════════════════════════
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (menuToggle && navMenu) {
        // Create overlay backdrop
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        navMenu.parentNode.appendChild(overlay);

        // Create close button inside sidebar
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sidebar-close';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.setAttribute('aria-label', 'Close menu');
        navMenu.prepend(closeBtn);

        // Create mobile buttons at bottom of sidebar
        const mobileButtons = document.createElement('div');
        mobileButtons.className = 'mobile-nav-buttons';
        mobileButtons.innerHTML = `
            <a href="login.html" class="btn-mobile-login">Login</a>
            <a href="admission.html" class="btn-mobile-apply">Apply Now</a>
        `;
        navMenu.appendChild(mobileButtons);

        // Toggle function
        function openSidebar() {
            navMenu.classList.add('active');
            overlay.classList.add('active');
            menuToggle.classList.add('active');
            document.body.style.overflow = 'hidden';

            const icon = menuToggle.querySelector('i');
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        }

        function closeSidebar() {
            navMenu.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.style.overflow = '';

            const icon = menuToggle.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }

        // Event listeners
        menuToggle.addEventListener('click', () => {
            if (navMenu.classList.contains('active')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        closeBtn.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);

        // Close sidebar when a nav link is clicked
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeSidebar);
        });

        // Close sidebar on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                closeSidebar();
            }
        });
    }

    // Load Notices Logic (for Index Page)
    const publicNoticeList = document.getElementById('publicNoticeList');
    if (publicNoticeList) {
        fetch('/api/notices')
            .then(res => res.json())
            .then(notices => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const validNotices = notices.filter(notice => {
                    if (notice.date) {
                        const expDate = new Date(notice.date);
                        // In old logic it checked expiryDate, let's keep all for now or check if it's too old
                    }
                    return true;
                }).slice(0, 3); // latest 3 notices only

                publicNoticeList.innerHTML = '';
                
                if (validNotices.length > 0) {
                    validNotices.forEach(notice => {
                        const li = document.createElement('li');
                        li.style.borderBottom = '1px solid #eee';
                        li.style.padding = '10px 0';
                        li.innerHTML = `<strong>${notice.title}</strong> <span style="font-size:0.8rem; color:#666; margin-left:10px;">(${new Date(notice.date).toLocaleDateString()})</span><br> <span style="font-size:0.9rem; color:#444;">${notice.description || ''}</span>`;
                        publicNoticeList.appendChild(li);
                    });
                }
            })
            .catch(err => console.error(err));
    }
});
