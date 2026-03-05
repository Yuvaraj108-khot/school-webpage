# SBS School Database Documentation

## Database Name: `sbs_school`

### Tables Created (Person B - Admin Side)

| Table | Description | Columns |
|-------|-------------|---------|
| `students` | Core student records used by academic tables | `id`, `student_code`, `name`, `class`, `medium`, `parent_name` |
| `teachers` | Faculty information for the teachers page | `id`, `name`, `subject`, `medium` |
| `gallery` | Image library for the school website | `id`, `image_url`, `category`, `description`, `upload_date` |
| `notices` | Announcements and upcoming events | `id`, `title`, `description`, `date` |
| `alumni` | Former student directory | `id`, `name`, `batch_year`, `profession` |

### Tables (Person A - Academic Side)
These tables reference the `student_code` from the `students` table.
- `attendance`
- `marks`
- `certificate_requests`

## Getting Started
1. Run the `setup_database.sql` script in your PostgreSQL environment.
2. Note: For a live website, you will need a backend (e.g., Express.js) to connect these tables to your HTML dashboards.
