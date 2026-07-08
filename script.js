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

    // ═══════════════════════════════════════════════
    // Easter Egg: Developed by Students Modal
    // ═══════════════════════════════════════════════
    const footerBottom = document.querySelector('.footer-bottom p');
    if (footerBottom) {
        // Append the Easter egg link to the footer text
        const devLink = document.createElement('a');
        devLink.href = 'javascript:void(0)';
        devLink.style.color = 'var(--secondary-color)';
        devLink.style.marginLeft = '10px';
        devLink.style.textDecoration = 'none';
        devLink.innerHTML = '&lt; / &gt; Developed by Students';
        footerBottom.appendChild(devLink);

        // Create the Modal
        const devModal = document.createElement('div');
        devModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; justify-content:center; align-items:center; backdrop-filter: blur(5px);';
        devModal.innerHTML = `
            <div style="background: white; padding: 2.5rem; border-radius: 15px; max-width: 400px; width: 90%; text-align: center; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: popIn 0.3s ease-out;">
                <span class="close-dev" style="position: absolute; top: 15px; right: 20px; font-size: 24px; cursor: pointer; color: #666;">&times;</span>
                <i class="fas fa-code" style="font-size: 3rem; color: var(--secondary-color); margin-bottom: 1rem;"></i>
                <h2 style="color: var(--primary-color); margin-bottom: 0.5rem; font-family: var(--font-heading);">The Dev Team</h2>
                <p style="color: #666; font-size: 0.9rem; margin-bottom: 1.5rem;">This website was proudly built by a team of 5 brilliant students as a school project, under the mentorship of Mr. SRIKANTH BHAT K.</p>
                <ul style="list-style: none; padding: 0; margin: 0; text-align: left; background: #f8fafc; padding: 1rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                    <li style="padding: 8px 0; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: var(--primary-color); margin-bottom: 5px;"><i class="fas fa-chalkboard-teacher" style="color: var(--secondary-color); margin-right: 10px;"></i> Mentor: Mr. Srikanth Bhat K</li>
                    <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600;"><a href="https://www.linkedin.com/in/yuvaraj-khot-b827b7369/" target="_blank" style="color: inherit; text-decoration: none; display: flex; justify-content: space-between; align-items: center;">Yuvaraj Khot <i class="fab fa-linkedin" style="color: #0a66c2;"></i></a></li>
                    <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600;"><a href="https://www.linkedin.com/in/shrivathsa-bhat-m/" target="_blank" style="color: inherit; text-decoration: none; display: flex; justify-content: space-between; align-items: center;">Shrivathsa Bhat M <i class="fab fa-linkedin" style="color: #0a66c2;"></i></a></li>
                    <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600;"><a href="https://www.linkedin.com/in/vikyath-t-kotian-335931361?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" style="color: inherit; text-decoration: none; display: flex; justify-content: space-between; align-items: center;">Vikyath.T.Kotian <i class="fab fa-linkedin" style="color: #0a66c2;"></i></a></li>
                    <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600;"><a href="https://www.linkedin.com/in/vinethraj-r-naik-762910339/" target="_blank" style="color: inherit; text-decoration: none; display: flex; justify-content: space-between; align-items: center;">Vinethraj.R.Naik <i class="fab fa-linkedin" style="color: #0a66c2;"></i></a></li>
                    <li style="padding: 8px 0; font-weight: 600;"><a href="https://www.linkedin.com/in/vineeth-bhatta-65b3723a2/" target="_blank" style="color: inherit; text-decoration: none; display: flex; justify-content: space-between; align-items: center;">Vineeth Bhatta <i class="fab fa-linkedin" style="color: #0a66c2;"></i></a></li>
                </ul>
            </div>
        `;
        document.body.appendChild(devModal);

        // Add popIn animation style if not exists
        if (!document.getElementById('devModalStyles')) {
            const style = document.createElement('style');
            style.id = 'devModalStyles';
            style.innerHTML = '@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }';
            document.head.appendChild(style);
        }

        // Toggle logic
        devLink.addEventListener('click', (e) => {
            e.preventDefault();
            devModal.style.display = 'flex';
        });

        devModal.querySelector('.close-dev').addEventListener('click', () => {
            devModal.style.display = 'none';
        });

        devModal.addEventListener('click', (e) => {
            if (e.target === devModal) {
                devModal.style.display = 'none';
            }
        });
    }
});
