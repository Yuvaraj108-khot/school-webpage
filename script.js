document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════════════
    // Premium Slide-in Sidebar Navigation Logic
    // ═══════════════════════════════════════════════
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (menuToggle && navMenu) {
        // Create overlay backdrop
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);

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
        const notices = localStorage.getItem('sbrs_notices');

        if (notices) {
            let parsedNotices = JSON.parse(notices);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            parsedNotices = parsedNotices.filter(notice => {
                if (notice.expiryDate) {
                    const expDate = new Date(notice.expiryDate);
                    if (expDate < today) return false;
                }
                return true;
            });

            if (parsedNotices.length > 0) {
                // Reverse iterate to maintain order when prepending (Newest at top)
                [...parsedNotices].reverse().forEach(notice => {
                    const li = document.createElement('li');
                    li.style.borderBottom = '1px solid #eee';
                    li.style.padding = '10px 0';
                    li.innerHTML = `<strong>${notice.title}</strong> <span style="font-size:0.8rem; color:#666; margin-left:10px;">(${notice.date})</span><br> <span style="font-size:0.9rem; color:#444;">${notice.details}</span>`;
                    publicNoticeList.insertBefore(li, publicNoticeList.firstChild);
                });
            }
        }
    }
});
