## Python Code Review Example

Input: A Python Flask route handler for user registration.

Review findings:
- [Critical] SQL injection vulnerability: raw string formatting in SQL query
- [Warning] Missing input validation for email format
- [Info] Consider using parameterized queries with SQLAlchemy
- Quality Score: 4/10
- Top Priority: Fix SQL injection immediately
