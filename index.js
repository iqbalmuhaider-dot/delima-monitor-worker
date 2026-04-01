// DELIMa Monitor Worker - D1 Database
// Handles login tracking, analytics, dashboard

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // API: Record login
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }
    
    // API: Get student stats
    if (path === '/api/student' && request.method === 'GET') {
      const email = url.searchParams.get('email');
      return handleGetStudent(email, env, corsHeaders);
    }
    
    // API: Get all students (teacher dashboard)
    if (path === '/api/students' && request.method === 'GET') {
      return handleGetStudents(env, corsHeaders);
    }
    
    // API: Get analytics
    if (path === '/api/analytics' && request.method === 'GET') {
      return handleAnalytics(env, corsHeaders);
    }
    
    // API: Get top students
    if (path === '/api/top-students' && request.method === 'GET') {
      const limit = url.searchParams.get('limit') || 10;
      return handleTopStudents(limit, env, corsHeaders);
    }
    
    // Default: Serve static files from Pages
    return env.ASSETS.fetch(request);
  }
};

// Handle login recording
async function handleLogin(request, env, corsHeaders) {
  try {
    const data = await request.json();
    const { studentName, studentEmail, schoolName } = data;
    
    if (!studentEmail) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Email is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if student exists
    const existing = await env.DB.prepare(
      'SELECT * FROM delima_logins WHERE student_email = ?'
    ).bind(studentEmail).first();
    
    if (existing) {
      // Update existing record
      await env.DB.prepare(`
        UPDATE delima_logins 
        SET login_count = login_count + 1, 
            last_login = datetime('now')
        WHERE student_email = ?
      `).bind(studentEmail).run();
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Login recorded',
        loginCount: existing.login_count + 1,
        isFirstLogin: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      // Insert new student
      const stmt = env.DB.prepare(`
        INSERT INTO delima_logins (student_name, student_email, school_name, login_count, first_login, last_login)
        VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      `);
      
      const result = await stmt.bind(studentName || '', studentEmail, schoolName || '').run();
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Login recorded',
        loginCount: 1,
        isFirstLogin: true,
        id: result.meta.last_row_id
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle get student info
async function handleGetStudent(email, env, corsHeaders) {
  try {
    if (!email) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Email is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const student = await env.DB.prepare(
      'SELECT * FROM delima_logins WHERE student_email = ?'
    ).bind(email).first();
    
    if (!student) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Student not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      student: student
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle get all students
async function handleGetStudents(env, corsHeaders) {
  try {
    const students = await env.DB.prepare(
      'SELECT * FROM delima_logins ORDER BY last_login DESC'
    ).all();
    
    return new Response(JSON.stringify({
      success: true,
      count: students.results.length,
      students: students.results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle analytics
async function handleAnalytics(env, corsHeaders) {
  try {
    // Get total stats
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_students,
        SUM(login_count) as total_logins,
        AVG(login_count) as avg_logins
      FROM delima_logins
    `).first();
    
    // Get today's logins
    const todayLogins = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM delima_logins
      WHERE DATE(last_login) = DATE('now')
    `).first();
    
    // Get logins by school
    const bySchool = await env.DB.prepare(`
      SELECT school_name, COUNT(*) as student_count, SUM(login_count) as total_logins
      FROM delima_logins
      WHERE school_name IS NOT NULL AND school_name != ''
      GROUP BY school_name
      ORDER BY student_count DESC
      LIMIT 10
    `).all();
    
    return new Response(JSON.stringify({
      success: true,
      stats: {
        totalStudents: stats.total_students,
        totalLogins: stats.total_logins,
        avgLogins: Math.round(stats.avg_logins * 100) / 100,
        todayLogins: todayLogins.count,
        bySchool: bySchool.results
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle top students
async function handleTopStudents(limit, env, corsHeaders) {
  try {
    const students = await env.DB.prepare(`
      SELECT * FROM delima_logins 
      ORDER BY login_count DESC, last_login DESC
      LIMIT ?
    `).bind(limit).all();
    
    return new Response(JSON.stringify({
      success: true,
      count: students.results.length,
      students: students.results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
