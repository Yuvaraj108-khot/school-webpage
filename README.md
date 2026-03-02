# Srimad Bhuvanendra School (SBS) Website Project

**Project Version:** 1.0.0  
**Last Updated:** February 6, 2026  
**Description:** A comprehensive, premium-designed, responsive multi-page website for SBRS Karkala, including public informational pages and role-based private dashboards for Students, Teachers, and Admins.

---

## 📁 Project Structure & Features

### 1. 🏠 Public Pages

#### `index.html` (Home Page)
*   **Hero Section:** Full-screen background image (`schoolimage.png`) with gradient overlay, welcome text, and "Apply Now" / "Login" call-to-actions.
*   **Navigation:** Sticky header with School Logo (`logo.png`), hamburger menu for mobile, and "Login"/"Apply" quick buttons.
*   **Introduction:** Brief history and Principal's message.
*   **Highlights:** 4-column grid showing key stats (20+ Years, Academics, Green Campus, Holistic Growth).
*   **Notices:** Dynamic-looking list of latest school announcements.
*   **Footer:** 4-column layout with Quick Links, Contact Info, and Copyright.

#### `about.html` (About Us)
*   **History:** Detailed narrative of the school's founding (2001) and vision of Dr. T.M.A. Pai.
*   **Vision & Mission:** Card layout explaining the founder's vision.
*   **Infrastructure:** Spotlight on the 14-acre campus, facilities list, and an embedded campus image.
*   **Management:** Principal's profile and message.

#### `academics.html` (Academics)
*   **Classes Offered:** Breakdown of sections (Kindergarten, Primary, High School).
*   **Methodology:** Checklist style explanation of teaching methods (Tutorials, Continuous Evaluation).
*   **Evaluation:** Details on the exam system and a downloadable Academic Calendar placeholder.

#### `admission.html` (Admissions)
*   **Procedure:** Step-by-step guide to applying.
*   **Eligibility:** Clear age and grade criteria table.
*   **Documents:** List of required paperwork.
*   **Online Application Form:** robust form collecting Student Info, Parent Info, and Document uploads (File inputs).

#### `gallery.html` (Gallery)
*   **Filterable Grid:** Tabs for "All", "Campus", "Events", etc. (UI only).
*   **Masonry Layout:** Responsive grid of images fetched from Unsplash (Library, Labs, Sports) + School Image.
*   **Responsive Images:** Cards adapt to screen size.

#### `alumni.html` (Alumni)
*   **Registration:** Form for old students to join the network.
*   **Success Stories:** Testimonial cards with user avatars and quotes.
*   **Connect:** Call to action for the alumni community.

#### `contact.html` (Contact Us)
*   **Info Card:** Address, Phone numbers, and Email with icons.
*   **Query Form:** "Send us a Message" form.
*   **Map:** Embedded Google Map pointing to Karkala.

---

### 2. 🔐 Login & Dashboards (New Features)

#### `login.html` (Unified Login Portal)
*   **Description:** Replaced separate login pages. Single entry point for all users.
*   **Features:**
    *   **Auto-Redirect Logic:** Simple JS checks username (`student`, `teacher`, `admin`) to route to the correct dashboard.
    *   **Back Button:** "Back to Home" button at top-right.
    *   **Responsive:** Centered card layout on mobile.

#### `dashboard_student.html` (Student Panel)
*   **Stats:** Cards showing Attendance %, Latest Grade, and Unread Notices.
*   **Marks Table:** Detailed table of recent exam results.
*   **Certificate Request:** Form to apply for customizable documents (Study Cert, TC, etc.).
*   **Sidebar:** Navigation for Marks, Attendance, etc.

#### `dashboard_teacher.html` (Teacher Panel)
*   **Daily Log:** Tool to record topics covered per class/subject.
*   **Marks Entry:** Interface to input marks for a list of students.
*   **Attendance Marking:** Checklist interface to mark students present/absent.

#### `dashboard_admin.html` (Admin Panel)
*   **Gallery Manager:** "Drag & Drop" interface simulation. Allows admin to "upload" a photo with a caption and see it appear in a preview list instantly.
*   **Event Publisher:** Simple form to add new notices to the site.

---

### 3. 🎨 Design & Technical Details

#### `style.css` (The Engine)
*   **Color Palette:** Premium Navy Blue (`#1a252f`) & Gold (`#f1c40f`).
*   **Typography:** Google Fonts 'Outfit' (Body) and 'Playfair Display' (Headings).
*   **Responsive System:**
    *   **Mobile Drawer:** Custom CSS for a slide-out menu on phones.
    *   **Flex/Grid:** Modern CSS features used for all layouts.
    *   **Media Queries:** Breakpoints at 900px and 600px for seamless adapting.

#### `script.js` (Interactivity)
*   **Mobile Menu:** Handles the toggle logic for the hamburger menu (slide in/out).
*   **Icon Toggle:** Switches between 'Bars' and 'X' icons.

---

### 4. 📝 Changelog

**v1.0.0 - Initial Release & Refinement**
*   [x] Created all 7 core static pages.
*   [x] Implemented Premium CSS design system.
*   [x] Added Responsive Mobile Navigation (Hamburger Menu).
*   [x] Integrated unified `login.html` with role-based redirection.
*   [x] Developed 3 Dashboard mockups (Student, Teacher, Admin).
*   [x] Fixed broken images using Unsplash and local placeholders.
*   [x] Added "Certificate Request" feature for students.
*   [x] Added "Gallery Drag & Drop" feature for admins.
*   [x] Added "Back Button" to login page.

---

**Note to Developer:** Please update this file whenever a new page is added or a significant feature is modified.
