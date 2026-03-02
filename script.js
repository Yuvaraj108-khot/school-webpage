document.addEventListener('DOMContentLoaded', () => {
    // Menu Toggle Logic
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navButtons = document.querySelector('.nav-buttons');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navButtons.classList.toggle('active');

            const icon = menuToggle.querySelector('i');
            if (icon.classList.contains('fa-bars')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }

    // Load Notices Logic (for Index Page)
    const publicNoticeList = document.getElementById('publicNoticeList');
    if (publicNoticeList) {
        const notices = localStorage.getItem('sbrs_notices');

        if (notices) {
            const parsedNotices = JSON.parse(notices);
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
