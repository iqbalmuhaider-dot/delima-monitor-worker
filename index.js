// DELIMa Monitor Worker - D1 Database + Google OAuth + Admin Role
// Handles login tracking, analytics, dashboard, user roles

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // API: Google login & record
    if (path === '/api/google-login' && request.method === 'POST') {
      return handleGoogleLogin(request, env, corsHeaders);
    }
    
    // API: Get current user
    if (path === '/api/me' && request.method === 'GET') {
      const email = url.searchParams.get('email');
      return handleGetUser(email, env, corsHeaders);
    }
    
    // API: Get all users (admin only)
    if (path === '/api/users' && request.method === 'GET') {
      const adminEmail = url.searchParams.get('admin');
      return handleGetAllUsers(adminEmail, env, corsHeaders);
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
    
    // API: Set user role (admin only)
    if (path === '/api/role' && request.method === 'PUT') {
      return handleSetRole(request, env, corsHeaders);
    }
    
    // Default: Serve static files from Pages
    return env.ASSETS.fetch(request);
  }
};

// Handle Google login & create user
async function handleGoogleLogin(request, env, corsHeaders) {
  try {
    const data = await request.json();
    const { email, name, picture, schoolName } = data;
    
    if (!email) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Email is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate DELIMa domain
    const allowedDomains = ['student.moe-dl.edu.my', 'moe-dl.edu.my'];
    const domain = email.split('@')[1];
    
    if (!allowedDomains.includes(domain)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Only DELIMa accounts allowed (@student.moe-dl.edu.my or @moe-dl.edu.my)'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if user exists
    const existing = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();
    
    if (existing) {
      // Update last login
      await env.DB.prepare(`
        UPDATE users 
        SET last_login = datetime('now'),
            login_count = login_count + 1
        WHERE email = ?
      `).bind(email).run();
      
      return new Response(JSON.stringify({
        success: true,
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          role: existing.role,
          isFirstLogin: false,
          loginCount: existing.login_count + 1
        },
        message: 'Welcome back!'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      // Check if this is the first user (make them admin)
      const firstUser = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM users'
      ).first();
      
      const role = firstUser.count === 0 ? 'admin' : 'user';
      
      // Insert new user
      const stmt = env.DB.prepare(`
        INSERT INTO users (email, name, picture, school_name, role, login_count, first_login, last_login)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `);
      
      const result = await stmt.bind(email, name || '', picture || '', schoolName || '', role).run();
      
      return new Response(JSON.stringify({
        success: true,
        user: {
          id: result.meta.last_row_id,
          email: email,
          name: name || '',
          role: role,
          isFirstLogin: true,
          loginCount: 1
        },
        message: role === 'admin' ? '🎉 Welcome Admin! You are the first user.' : 'Welcome!'
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

// Handle get current user
async function handleGetUser(email, env, corsHeaders) {
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
    
    const user = await env.DB.prepare(
      'SELECT id, email, name, picture, role, login_count, first_login, last_login FROM users WHERE email = ?'
    ).bind(email).first();
    
    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      user: user
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

// Handle get all users (admin only)
async function handleGetAllUsers(adminEmail, env, corsHeaders) {
  try {
    // Verify admin
    if (adminEmail) {
      const admin = await env.DB.prepare(
        'SELECT role FROM users WHERE email = ?'
      ).bind(adminEmail).first();
      
      if (!admin || admin.role !== 'admin') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Admin access required'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    const users = await env.DB.prepare(
      'SELECT id, email, name, picture, role, login_count, first_login, last_login FROM users ORDER BY created_at DESC'
    ).all();
    
    return new Response(JSON.stringify({
      success: true,
      count: users.results.length,
      users: users.results
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

// Handle set user role (admin only)
async function handleSetRole(request, env, corsHeaders) {
  try {
    const data = await request.json();
    const { targetEmail, newRole, adminEmail } = data;
    
    // Verify admin
    const admin = await env.DB.prepare(
      'SELECT role FROM users WHERE email = ?'
    ).bind(adminEmail).first();
    
    if (!admin || admin.role !== 'admin') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin access required'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Update role
    await env.DB.prepare(`
      UPDATE users SET role = ?, updated_at = datetime('now') WHERE email = ?
    `).bind(newRole, targetEmail).run();
    
    return new Response(JSON.stringify({
      success: true,
      message: `User role updated to ${newRole}`
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
