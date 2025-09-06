# Backend Interview Challenge - Task Sync API

This is a backend developer interview challenge focused on building a sync-enabled task management API. The challenge evaluates understanding of REST APIs, data synchronization, offline-first architecture, and conflict resolution.

## 📚 Documentation Overview

Please read these documents in order:

1. **[📋 Submission Instructions](./docs/SUBMISSION_INSTRUCTIONS.md)** - How to submit your solution (MUST READ)
2. **[📝 Requirements](./docs/REQUIREMENTS.md)** - Detailed challenge requirements and implementation tasks
3. **[🔌 API Specification](./docs/API_SPEC.md)** - Complete API documentation with examples
4. **[🤖 AI Usage Guidelines](./docs/AI_GUIDELINES.md)** - Guidelines for using AI tools during the challenge

**⚠️ Important**: DO NOT create pull requests against this repository. All submissions must be through private forks.

## Challenge Overview

Candidates are expected to implement a backend API that:
- Manages tasks (CRUD operations)
- Supports offline functionality with a sync queue
- Handles conflict resolution when syncing
- Provides robust error handling

## Project Structure

```
backend-interview-challenge/
├── src/
│   ├── db/             # Database setup and configuration
│   ├── models/         # Data models (if needed)
│   ├── services/       # Business logic (TO BE IMPLEMENTED)
│   ├── routes/         # API endpoints (TO BE IMPLEMENTED)
│   ├── middleware/     # Express middleware
│   ├── types/          # TypeScript interfaces
│   └── server.ts       # Express server setup
├── tests/              # Test files
├── docs/               # Documentation
└── package.json        # Dependencies and scripts
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types

## Your Task

### Key Implementation Files

You'll need to implement the following services and routes:

- `src/services/taskService.ts` - Task CRUD operations
- `src/services/syncService.ts` - Sync logic and conflict resolution  
- `src/routes/tasks.ts` - REST API endpoints
- `src/routes/sync.ts` - Sync-related endpoints

### Before Submission

Ensure all of these pass:
```bash
npm test          # All tests must pass
npm run lint      # No linting errors
npm run typecheck # No TypeScript errors
```

### Time Expectation

This challenge is designed to take 2-3 hours to complete.

## License

This project is for interview purposes only.


---

## 📌 Candidate Implementation Notes (Sneha K)

### 🚀 How to Run the Project
1. Clone the repository:
   ```bash
   git clone https://github.com/snehak07/backend-interview-challenge-private.git
   cd backend-interview-challenge

2. Install dependencies:
npm install

3. Copy the environment variables:
cp .env.example .env

4. Start the application:
npm run dev
 
📂 Branch

Development work is on the dev branch.

🗄️ Database

SQLite database (./data/tasks.sqlite3) is used.

🔗 API Endpoints

GET /api/tasks → Fetch all tasks

GET /api/tasks/:id → Fetch single task

POST /api/tasks → Create a new task

PUT /api/tasks/:id → Update a task

DELETE /api/tasks/:id → Delete a task

POST /api/sync → Trigger sync

GET /api/status → Get sync status

GET /api/health → Health check

