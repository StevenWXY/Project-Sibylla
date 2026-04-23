## TypeScript Code Review Example

Input: A React component for file upload with progress tracking.

Review findings:
- [Warning] Missing error state handling in upload promise
- [Warning] Memory leak: event listener not cleaned up in useEffect
- [Info] Consider using useCallback for the upload handler
- Quality Score: 6/10
- Top Priority: Add useEffect cleanup for event listener
