# CodeAssPlat

CodeAssPlat is a multi-role code assignment platform with separate interfaces for Admin, Student, and Teacher, plus a shared Node.js backend for teacher-side APIs and data handling.

## Project Structure

- `Admin/` admin login and dashboard pages
- `Student/` student login, dashboard, and frontend assets
- `Teacher/teacherFE-*` teacher frontend pages
- `Teacher/backend/` Express + MongoDB backend

## Backend Setup

1. Go to `Teacher/backend`
2. Install dependencies with `npm install`
3. Create a `.env` file based on `.env.example`
4. Start the server with `npm start`

Required environment variables:

- `MONGO_URI`
- `JWT_SECRET`
- `PORT` (optional, defaults to `4000`)

## GitHub Push

After creating a GitHub repository, run:

```powershell
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

## Next Development Ideas

- connect frontend pages to the shared backend consistently
- add validation and error states to login and dashboard flows
- move repeated frontend logic into shared utilities
- add a root-level development guide for running all parts together
