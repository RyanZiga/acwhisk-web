import { Hono } from 'npm:hono'
import { cors } from 'npm:hono/cors'
import { logger } from 'npm:hono/logger'
import { createClient } from 'npm:@supabase/supabase-js'
import * as kv from './kv_store.tsx'

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['*'],
}))
app.use('*', logger(console.log))

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

// Initialize storage buckets
async function initializeBuckets() {
  const buckets = [
    'make-cfac176d-recipes',
    'make-cfac176d-profiles',
    'make-cfac176d-forums',
    'make-cfac176d-resources',
    'make-cfac176d-chat-media'
  ]
  
  const { data: existingBuckets } = await supabase.storage.listBuckets()
  
  for (const bucketName of buckets) {
    const bucketExists = existingBuckets?.some(bucket => bucket.name === bucketName)
    if (!bucketExists) {
      const { error } = await supabase.storage.createBucket(bucketName, { 
        public: false,
        allowedMimeTypes: [
          'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
          'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
        ],
        fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
      })
      if (error) {
        console.log(`Error creating bucket ${bucketName}:`, error)
      } else {
        console.log(`Created bucket: ${bucketName}`)
      }
    }
  }
}

initializeBuckets()

// Helper function to get user from token
async function getUserFromToken(request: Request) {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1]
  if (!accessToken) {
    return { user: null, error: 'No token provided' }
  }
  
  const { data, error } = await supabase.auth.getUser(accessToken)
  return { user: data.user, error }
}

// Auth routes
app.post('/make-server-cfac176d/auth/signup', async (c) => {
  try {
    const { email, password, name, role = 'student' } = await c.req.json()
    
    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400)
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Please enter a valid email address' }, 400)
    }
    
    // Validate password strength
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters long' }, 400)
    }
    
    // Validate role
    if (!['student', 'instructor', 'admin'].includes(role)) {
      return c.json({ error: 'Invalid role. Must be student, instructor, or admin' }, 400)
    }
    
    // Validate name
    if (name.trim().length < 2) {
      return c.json({ error: 'Name must be at least 2 characters long' }, 400)
    }
    
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      user_metadata: { name: name.trim(), role },
      // Automatically confirm the user's email since SMTP is already configured
      email_confirm: true
    })
    
    if (error) {
      console.log('Signup error:', error)
      // Handle common signup errors with user-friendly messages
      if (error.message.includes('already registered')) {
        return c.json({ error: 'An account with this email already exists. Please sign in instead.' }, 400)
      }
      if (error.message.includes('email')) {
        return c.json({ error: 'Please enter a valid email address' }, 400)
      }
      if (error.message.includes('password')) {
        return c.json({ error: 'Password is too weak. Please choose a stronger password.' }, 400)
      }
      return c.json({ error: error.message }, 400)
    }
    
    if (!data.user) {
      return c.json({ error: 'Failed to create user account' }, 500)
    }
    
    // Store user profile in KV store
    try {
      await kv.set(`user:${data.user.id}`, {
        id: data.user.id,
        email: data.user.email,
        name: name.trim(),
        role,
        created_at: new Date().toISOString(),
        profile_complete: false,
        avatar_url: null,
        bio: null,
        year_level: null,
        specialization: null,
        phone: null,
        location: null
      })
    } catch (kvError) {
      console.log('KV store error (non-critical):', kvError)
      // Continue without failing - profile can be created later
    }
    
    return c.json({ 
      user: data.user, 
      success: true,
      message: 'Account created successfully! You can now sign in.'
    })
  } catch (error) {
    console.log('Signup server error:', error)
    return c.json({ error: 'An unexpected error occurred during signup. Please try again.' }, 500)
  }
})

// Get user profile
app.get('/make-server-cfac176d/profile', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const profile = await kv.get(`user:${user.id}`)
    if (!profile) {
      return c.json({ error: 'Profile not found' }, 404)
    }
    
    return c.json({ profile })
  } catch (error) {
    console.log('Get profile error:', error)
    return c.json({ error: 'Internal server error fetching profile' }, 500)
  }
})

// Update user profile
app.put('/make-server-cfac176d/profile', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const updates = await c.req.json()
    const currentProfile = await kv.get(`user:${user.id}`)
    
    if (!currentProfile) {
      return c.json({ error: 'Profile not found' }, 404)
    }
    
    const updatedProfile = { ...currentProfile, ...updates, updated_at: new Date().toISOString() }
    await kv.set(`user:${user.id}`, updatedProfile)
    
    return c.json({ profile: updatedProfile })
  } catch (error) {
    console.log('Update profile error:', error)
    return c.json({ error: 'Internal server error updating profile' }, 500)
  }
})

// Recipe routes
app.post('/make-server-cfac176d/recipes', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const recipe = await c.req.json()
    const recipeId = crypto.randomUUID()
    
    const newRecipe = {
      id: recipeId,
      ...recipe,
      author_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ratings: [],
      comments: []
    }
    
    await kv.set(`recipe:${recipeId}`, newRecipe)
    
    // Add to user's recipes list
    const userRecipes = await kv.get(`user_recipes:${user.id}`) || []
    userRecipes.push(recipeId)
    await kv.set(`user_recipes:${user.id}`, userRecipes)
    
    return c.json({ recipe: newRecipe })
  } catch (error) {
    console.log('Create recipe error:', error)
    return c.json({ error: 'Internal server error creating recipe' }, 500)
  }
})

// Get all recipes
app.get('/make-server-cfac176d/recipes', async (c) => {
  try {
    const recipes = await kv.getByPrefix('recipe:')
    return c.json({ recipes })
  } catch (error) {
    console.log('Get recipes error:', error)
    return c.json({ error: 'Internal server error fetching recipes' }, 500)
  }
})

// Get user's recipes
app.get('/make-server-cfac176d/my-recipes', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const recipeIds = await kv.get(`user_recipes:${user.id}`) || []
    const recipes = await Promise.all(
      recipeIds.map(async (id: string) => await kv.get(`recipe:${id}`))
    )
    
    return c.json({ recipes: recipes.filter(Boolean) })
  } catch (error) {
    console.log('Get user recipes error:', error)
    return c.json({ error: 'Internal server error fetching user recipes' }, 500)
  }
})

// Forum routes
app.post('/make-server-cfac176d/forum/posts', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const post = await c.req.json()
    const postId = crypto.randomUUID()
    
    const newPost = {
      id: postId,
      ...post,
      author_id: user.id,
      created_at: new Date().toISOString(),
      replies: []
    }
    
    await kv.set(`forum_post:${postId}`, newPost)
    
    return c.json({ post: newPost })
  } catch (error) {
    console.log('Create forum post error:', error)
    return c.json({ error: 'Internal server error creating forum post' }, 500)
  }
})

// Get forum posts
app.get('/make-server-cfac176d/forum/posts', async (c) => {
  try {
    const posts = await kv.getByPrefix('forum_post:')
    return c.json({ posts })
  } catch (error) {
    console.log('Get forum posts error:', error)
    return c.json({ error: 'Internal server error fetching forum posts' }, 500)
  }
})

// Learning resources routes
app.post('/make-server-cfac176d/resources', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const userProfile = await kv.get(`user:${user.id}`)
    if (!userProfile || (userProfile.role !== 'instructor' && userProfile.role !== 'admin')) {
      return c.json({ error: 'Only instructors and admins can create resources' }, 403)
    }
    
    const resource = await c.req.json()
    const resourceId = crypto.randomUUID()
    
    const newResource = {
      id: resourceId,
      ...resource,
      author_id: user.id,
      created_at: new Date().toISOString()
    }
    
    await kv.set(`resource:${resourceId}`, newResource)
    
    return c.json({ resource: newResource })
  } catch (error) {
    console.log('Create resource error:', error)
    return c.json({ error: 'Internal server error creating resource' }, 500)
  }
})

// Get learning resources
app.get('/make-server-cfac176d/resources', async (c) => {
  try {
    const resources = await kv.getByPrefix('resource:')
    return c.json({ resources })
  } catch (error) {
    console.log('Get resources error:', error)
    return c.json({ error: 'Internal server error fetching resources' }, 500)
  }
})

// Admin routes
app.get('/make-server-cfac176d/admin/users', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const userProfile = await kv.get(`user:${user.id}`)
    if (!userProfile || userProfile.role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403)
    }
    
    const users = await kv.getByPrefix('user:')
    return c.json({ users })
  } catch (error) {
    console.log('Get users error:', error)
    return c.json({ error: 'Internal server error fetching users' }, 500)
  }
})

// Legacy image upload route - redirects to new storage route
app.post('/make-server-cfac176d/upload-image', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }
    
    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validImageTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Please upload an image.' }, 400)
    }
    
    // Validate file size (10MB max for images)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 10MB' }, 400)
    }
    
    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const bucketName = 'make-cfac176d-recipes'
    
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        contentType: file.type,
        cacheControl: '3600'
      })
    
    if (uploadError) {
      console.log('Upload error:', uploadError)
      return c.json({ error: 'Failed to upload image' }, 500)
    }
    
    // Create signed URL with longer expiry for images
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 24 * 3600) // 24 hours
    
    if (urlError) {
      console.log('Signed URL error:', urlError)
      return c.json({ error: 'Failed to create access URL' }, 500)
    }
    
    return c.json({ 
      url: signedUrlData?.signedUrl,
      fileName,
      bucket: bucketName,
      fileType: 'image'
    })
  } catch (error) {
    console.log('Image upload error:', error)
    return c.json({ error: 'Internal server error during image upload' }, 500)
  }
})

// Enhanced file upload route with validation and proper storage handling
app.post('/make-server-cfac176d/upload/:bucket', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const bucket = c.req.param('bucket')
    const validBuckets = ['recipes', 'profiles', 'forums', 'resources', 'chat-media']
    
    if (!validBuckets.includes(bucket)) {
      return c.json({ error: 'Invalid bucket' }, 400)
    }
    
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }
    
    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    const allValidTypes = [...validImageTypes, ...validVideoTypes]
    
    if (!allValidTypes.includes(file.type)) {
      return c.json({ 
        error: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, WebP) or video (MP4, WebM, OGG, MOV).' 
      }, 400)
    }
    
    // Validate file size based on type - reduced limits for optimized uploads
    const isVideo = validVideoTypes.includes(file.type)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024 // 50MB for videos, 5MB for images (client-side optimized)
    
    if (file.size > maxSize) {
      const sizeLimit = isVideo ? '50MB' : '5MB'
      return c.json({ error: `File size must be less than ${sizeLimit}` }, 400)
    }
    
    // Create organized file path with optimization indicators
    const fileExtension = file.name.split('.').pop()
    const timestamp = Date.now()
    const randomId = crypto.randomUUID().substring(0, 8)
    
    // Use WebP extension for optimized images
    const optimizedExtension = file.type === 'image/webp' ? 'webp' : fileExtension
    const fileName = `${user.id}/${isVideo ? 'videos' : 'images'}/${timestamp}-${randomId}.${optimizedExtension}`
    const bucketName = `make-cfac176d-${bucket}`
    
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        contentType: file.type,
        cacheControl: '86400', // 24 hours cache for better performance
        upsert: false
      })
    
    if (uploadError) {
      console.log('Upload error:', uploadError)
      return c.json({ error: 'Failed to upload file' }, 500)
    }
    
    // Create signed URL with longer expiry for optimized images
    const urlExpiry = isVideo ? 7 * 24 * 3600 : 7 * 24 * 3600 // 7 days for both (optimized images can be cached longer)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, urlExpiry)
    
    if (urlError) {
      console.log('Signed URL error:', urlError)
      return c.json({ error: 'Failed to create access URL' }, 500)
    }
    
    return c.json({ 
      fileName,
      url: signedUrlData?.signedUrl,
      bucket: bucketName,
      fileType: isVideo ? 'video' : 'image',
      fileSize: file.size,
      mimeType: file.type,
      isOptimized: file.type === 'image/webp' && file.size < 2 * 1024 * 1024 // Mark as optimized if WebP and under 2MB
    })
  } catch (error) {
    console.log('File upload error:', error)
    return c.json({ error: 'Internal server error during file upload' }, 500)
  }
})

// Optimized image serving route with responsive sizing
app.get('/make-server-cfac176d/image/:bucket/:path*', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const bucket = c.req.param('bucket')
    const path = c.req.param('path')
    const width = c.req.query('w') // Width parameter for responsive images
    const quality = c.req.query('q') || '85' // Quality parameter
    
    if (!bucket || !path) {
      return c.json({ error: 'Invalid parameters' }, 400)
    }
    
    // Create signed URL with caching headers
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 24 * 3600) // 24 hours
    
    if (urlError) {
      console.log('Signed URL error:', urlError)
      return c.json({ error: 'Failed to create access URL' }, 500)
    }
    
    // Return optimized image URL with responsive parameters
    return c.json({ 
      url: signedUrlData?.signedUrl,
      responsive: {
        mobile: signedUrlData?.signedUrl + (width ? `&w=400` : ''),
        tablet: signedUrlData?.signedUrl + (width ? `&w=800` : ''),
        desktop: signedUrlData?.signedUrl + (width ? `&w=1200` : '')
      },
      cacheExpiry: 24 * 3600
    })
  } catch (error) {
    console.log('Optimized image serving error:', error)
    return c.json({ error: 'Internal server error serving image' }, 500)
  }
})

// Get signed URL for existing file
app.post('/make-server-cfac176d/get-signed-url', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const { fileName, bucket } = await c.req.json()
    
    if (!fileName || !bucket) {
      return c.json({ error: 'fileName and bucket are required' }, 400)
    }
    
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 24 * 3600) // 24 hours
    
    if (urlError) {
      console.log('Signed URL error:', urlError)
      return c.json({ error: 'Failed to create access URL' }, 500)
    }
    
    return c.json({ 
      url: signedUrlData?.signedUrl
    })
  } catch (error) {
    console.log('Get signed URL error:', error)
    return c.json({ error: 'Internal server error getting signed URL' }, 500)
  }
})

// Delete file from storage
app.delete('/make-server-cfac176d/delete-file', async (c) => {
  try {
    const { user, error } = await getUserFromToken(c.req.raw)
    if (!user) {
      return c.json({ error: error || 'Unauthorized' }, 401)
    }
    
    const { fileName, bucket } = await c.req.json()
    
    if (!fileName || !bucket) {
      return c.json({ error: 'fileName and bucket are required' }, 400)
    }
    
    // Only allow users to delete their own files
    if (!fileName.startsWith(`${user.id}/`)) {
      return c.json({ error: 'Unauthorized to delete this file' }, 403)
    }
    
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([fileName])
    
    if (deleteError) {
      console.log('Delete error:', deleteError)
      return c.json({ error: 'Failed to delete file' }, 500)
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.log('Delete file error:', error)
    return c.json({ error: 'Internal server error deleting file' }, 500)
  }
})

Deno.serve(app.fetch)