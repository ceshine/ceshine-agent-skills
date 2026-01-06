# Troubleshooting

## Common Issues

### API Key Not Found

**Error**: `CONTEXT7_API_KEY not found`

**Solutions**: Set environment variable:
   ```bash
   export CONTEXT7_API_KEY="your-key"
   ```
 
### Connection Timeout

**Error**: `TimeoutError` or `ConnectionError`

**Solutions**:
1. Increase timeout:
   ```bash
   export CONTEXT7_TIMEOUT=60
   ```

2. Check network connection
3. Verify API endpoint accessibility

### Library Not Found

**Error**: Library resolution returns empty or error

**Solutions**:
1. Try alternative library names:
   ```bash
   uv run --script scripts/context7_cli.py resolve "python requests"
   ```

2. Check spelling and case sensitivity
3. Use the query parameter for fuzzy matching

### Rate Limiting

**Error**: `429 Too Many Requests`

**Solutions**:
1. Implement backoff:
   ```python
   import time
   time.sleep(2 ** retry_count)
   ```

2. Reduce request frequency
3. Contact Context7 for rate limit increase

### Invalid Library ID

**Error**: Query returns error for library ID

**Solutions**:
1. First resolve the library to get correct ID:
   ```bash
   uv run --script scripts/context7_cli.py resolve react
   ```
2. Use the exact ID from resolution response

## Log Collection

For issue reporting, collect:

1. Error messages
2. Environment variables (without API key)
3. Python version: `uv run python --version`
