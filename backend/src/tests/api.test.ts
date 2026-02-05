/**
 * API Tests for Job Search Assistant
 * Run with: npx tsx src/tests/api.test.ts
 */

const BASE_URL = 'http://localhost:3001/api';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  });
  return { status: res.status, data: await res.json() };
}

// ============ HEALTH CHECK ============
async function testHealthCheck() {
  await test('Health check returns ok', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/health`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.status !== 'ok') throw new Error(`Expected status ok, got ${data.status}`);
  });
}

// ============ JOBS API ============
async function testJobsApi() {
  let createdJobId: number;

  await test('GET /jobs returns array', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!Array.isArray(data.jobs)) throw new Error('Expected jobs array');
  });

  await test('POST /jobs creates a job', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Engineer',
        company_name: 'Test Company',
        location: 'Remote',
        salary_min: 100000,
        salary_max: 150000,
        salary_type: 'annual',
        remote_type: 'remote',
        source: 'manual',
        source_url: 'https://example.com/job/123',
        description: 'Test job description'
      })
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.id) throw new Error('Expected job id');
    createdJobId = data.id;
  });

  await test('GET /jobs/:id returns the job', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.title !== 'Test Engineer') throw new Error('Title mismatch');
    if (data.source_url !== 'https://example.com/job/123') throw new Error('Source URL mismatch');
  });

  await test('GET /jobs/:id includes source_url for apply link', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.source_url) throw new Error('source_url is missing - apply link will not work!');
    if (!data.source_url.startsWith('http')) throw new Error('source_url is not a valid URL');
  });

  await test('PATCH /jobs/:id updates status', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'interested', priority: 3 })
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.status !== 'interested') throw new Error('Status not updated');
    if (data.priority !== 3) throw new Error('Priority not updated');
  });

  await test('POST /jobs/:id/apply marks job as applied', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ resume_version: 'ai' })
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.success) throw new Error('Apply failed');
  });

  await test('GET /jobs/:id shows applied status and has reminder', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.status !== 'applied') throw new Error('Status should be applied');
    if (!data.application) throw new Error('Application record missing');
    if (!data.reminders || data.reminders.length === 0) throw new Error('Follow-up reminder not created');
  });

  await test('GET /jobs with status filter', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs?status=applied`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const appliedJobs = data.jobs.filter((j: any) => j.status === 'applied');
    if (appliedJobs.length === 0) throw new Error('No applied jobs found');
  });

  await test('GET /jobs with search filter', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/jobs?search=Test`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.jobs.length === 0) throw new Error('Search should find test job');
  });

  await test('DELETE /jobs/:id removes job', async () => {
    const { status } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`, {
      method: 'DELETE'
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('GET /jobs/:id returns 404 for deleted job', async () => {
    const { status } = await fetchJson(`${BASE_URL}/jobs/${createdJobId}`);
    if (status !== 404) throw new Error(`Expected 404, got ${status}`);
  });
}

// ============ REMINDERS API ============
async function testRemindersApi() {
  // First create a job to attach reminder to
  const { data: job } = await fetchJson(`${BASE_URL}/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Reminder Test Job',
      company_name: 'Reminder Co'
    })
  });

  let reminderId: number;

  await test('POST /reminders creates reminder', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/reminders`, {
      method: 'POST',
      body: JSON.stringify({
        job_id: job.id,
        type: 'follow_up',
        due_date: '2026-02-15',
        message: 'Test reminder'
      })
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.id) throw new Error('Expected reminder id');
    reminderId = data.id;
  });

  await test('GET /reminders returns reminders with job info', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/reminders`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!Array.isArray(data)) throw new Error('Expected array');
    const reminder = data.find((r: any) => r.id === reminderId);
    if (!reminder) throw new Error('Reminder not found');
    if (!reminder.job_title) throw new Error('job_title missing');
    if (!reminder.company_name) throw new Error('company_name missing');
  });

  await test('PATCH /reminders/:id marks complete', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/reminders/${reminderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: true })
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.completed !== 1) throw new Error('Not marked complete');
  });

  await test('DELETE /reminders/:id removes reminder', async () => {
    const { status } = await fetchJson(`${BASE_URL}/reminders/${reminderId}`, {
      method: 'DELETE'
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  // Cleanup
  await fetchJson(`${BASE_URL}/jobs/${job.id}`, { method: 'DELETE' });
}

// ============ STATS API ============
async function testStatsApi() {
  await test('GET /stats returns dashboard stats', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/stats`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (typeof data.total !== 'number') throw new Error('total missing');
    if (typeof data.h1bSponsors !== 'number') throw new Error('h1bSponsors missing');
    if (!data.byStatus) throw new Error('byStatus missing');
    if (!data.reminders) throw new Error('reminders missing');
    if (!data.funnel) throw new Error('funnel missing');
  });
}

// ============ H1B API ============
async function testH1bApi() {
  await test('GET /h1b/check/:company returns result', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/h1b/check/Google`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.company) throw new Error('company missing');
    if (data.sponsors === undefined) throw new Error('sponsors missing');
    if (!data.confidence) throw new Error('confidence missing');
  });

  await test('GET /h1b/stats returns stats', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/h1b/stats`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (typeof data.totalRecords !== 'number') throw new Error('totalRecords missing');
  });
}

// ============ SYNC API ============
async function testSyncApi() {
  await test('GET /sync/status returns status', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/sync/status`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (typeof data.inProgress !== 'boolean') throw new Error('inProgress missing');
  });
}

// ============ DOCUMENTS API ============
async function testDocumentsApi() {
  await test('GET /documents/1/resume returns document or 404', async () => {
    const { status } = await fetchJson(`${BASE_URL}/documents/1/resume`);
    if (status !== 200 && status !== 404) throw new Error(`Expected 200 or 404, got ${status}`);
  });

  await test('GET /documents/1 lists documents', async () => {
    const { status, data } = await fetchJson(`${BASE_URL}/documents/1`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.documents) throw new Error('documents missing');
    if (!Array.isArray(data.documents)) throw new Error('documents should be array');
  });
}

// ============ RUN ALL TESTS ============
async function runAllTests() {
  console.log('\n========================================');
  console.log('Running API Tests');
  console.log('========================================\n');

  try {
    await testHealthCheck();
    await testJobsApi();
    await testRemindersApi();
    await testStatsApi();
    await testH1bApi();
    await testSyncApi();
    await testDocumentsApi();
  } catch (error) {
    console.error('Test suite error:', error);
  }

  console.log('\n========================================');
  console.log('Test Results');
  console.log('========================================');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

runAllTests();
