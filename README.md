# CodeAssPlat

CodeAssPlat is a multi-role coding assessment platform for colleges, classrooms, and programming labs. It provides separate interfaces for admins, teachers, and students, backed by an Express and MongoDB API with Docker-based code execution.

## Features

- Role-based login for Admin, Teacher, and Student users
- Admin dashboard for managing users, departments, subjects, and analytics
- Bulk student creation with Excel import support
- Teacher dashboard for creating problems, assigning subjects, monitoring students, and reviewing submissions
- Student dashboard with problem listing, code editor, submission flow, and saved work
- Docker-powered code execution for Python, Java, JavaScript, C, C++, Rust, and Ruby
- HTML/CSS/JS Web IDE flow for frontend-style assignments
- Hidden and visible test cases for coding problems
- Anti-cheat monitoring events and teacher monitoring views
- Teacher review workflow for GUI, graph, ML visual, and web-based submissions

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose
- Authentication: JWT and bcrypt
- Code execution: Docker containers
- Excel import: xlsx

## Project Structure

```text
CodeAssPlat/
|-- Admin/                       # Admin login, dashboard, user and subject pages
|-- Student/                     # Student login, dashboard, coding IDE, and Web IDE
|-- Teacher/
|   |-- backend/                 # Express API, MongoDB models, routes, executor service
|   |-- teacherFE-dashboard/     # Teacher dashboard and task completion pages
|   |-- teacherFE-monitoring/    # Anti-cheat/session monitoring UI
|   |-- teacherFE-problems/      # Problem list and problem detail pages
|   |-- teacherFE-students/      # Student list and student detail pages
|   `-- teacherFE-upload_page/   # Problem creation/editing page
`-- shared/                      # Shared project assets/utilities, if needed
```

## Prerequisites

Install these before running the project:

- Node.js
- npm
- MongoDB or MongoDB Atlas
- Docker Desktop, required for code execution
- Git

## Backend Setup

1. Go to the backend folder:

```bash
cd Teacher/backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file from the example:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

4. Update `.env` with your values:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=4000
EXECUTOR_BASE_URL=http://localhost:4000
```

5. Start the backend:

```bash
npm start
```

The API will run at:

```text
http://localhost:4000
```

## Create the First Admin

After configuring MongoDB, create or reset the default admin user:

```bash
npm run create-admin
```

Default admin credentials created by the script:

```text
Email: admin@adm.com
Password: Admin@123
```

Change these credentials after your first login before using the project in a real environment.

## Docker Executor Setup

CodeAssPlat runs submitted code inside Docker containers. Make sure Docker Desktop is running before using the code editor.

The executor can use public Docker images for most languages:

- `python:3.10`
- `eclipse-temurin:17-jdk-jammy`
- `node:20-alpine`
- `gcc:latest`
- `ruby:3.2-alpine`
- `rust:latest`

Optional custom images are provided for richer Java/Python assignments:

```bash
docker build -t codeassplat-python-ml:latest Teacher/backend/docker/python-ml
docker build -t codeassplat-java-academic:latest Teacher/backend/docker/java-academic
```

If these custom images are not available, the backend falls back to standard public images where possible.

## Running the Frontend

This project uses static HTML, CSS, and JavaScript pages. After the backend is running, open the required page in your browser:

```text
Admin/login.html
Student/login.html
Teacher/teacherFE-dashboard/index.html
```

By default, frontend pages call the backend at:

```text
http://localhost:4000
```

To point the frontend to another backend URL, set this value in the browser console:

```js
localStorage.setItem("API_BASE_URL", "http://your-backend-url");
```

Then refresh the page.

## Main API Routes

```text
GET  /                         Backend health message
POST /api/auth/login           Login
GET  /api/auth/me              Current user profile

/api/admin                     Admin users, departments, subjects, analytics
/api/teacher                   Teacher dashboard, students, assigned subjects
/api/problems                  Problem creation, listing, update, and detail APIs
/api/subjects                  Subject APIs
/api/submissions               Save, submit, review, and summary APIs
/api/execute                   Run code in Docker
/api/languages                 Supported execution languages
/api/monitoring                Anti-cheat/session monitoring APIs
```

## Supported Languages

- Python 3
- Java
- JavaScript
- C
- C++
- Rust
- Ruby
- HTML/CSS/JS Web IDE

## Typical Workflow

1. Start MongoDB and Docker.
2. Start the backend from `Teacher/backend`.
3. Create the first admin with `npm run create-admin`.
4. Log in through `Admin/login.html`.
5. Add departments, teachers, subjects, and students.
6. Teachers create problems and review submissions.
7. Students log in, solve assigned problems, run code, and submit solutions.

## Security Notes

- Do not commit `.env` files or real database credentials.
- Replace the default admin credentials before deployment.
- Use a strong `JWT_SECRET`.
- Run the backend behind HTTPS in production.
- Review Docker resource limits before hosting public submissions.

## Future Improvements

- Add a unified frontend build system
- Add automated backend tests
- Add deployment configuration
- Improve centralized frontend routing and shared utilities
- Add stricter request validation for API payloads

## License

This project is currently not licensed. Add a license file before publishing or distributing it.
