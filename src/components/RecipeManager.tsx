import React, { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { useRealtime } from './hooks/useRealtime'
import { supabase } from '../utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Alert, AlertDescription } from './ui/alert'
import { Skeleton } from './ui/skeleton'
import { RecipeRatingReview } from './RecipeRatingReview'
import { 
  Plus, 
  Clock, 
  Users, 
  Star, 
  ChefHat, 
  Search,
  Filter,
  Upload,
  X,
  Eye,
  MessageCircle,
  Heart,
  HeartOff,
  Edit,
  Trash2,
  MoreHorizontal
} from 'lucide-react'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { OptimizedMediaUpload } from './OptimizedMediaUpload'
import { OptimizedImage, RecipeCardImage } from './OptimizedImage'
import { useNotifications } from './ui/notification'

export function RecipeManager() {
  const { user, session } = useAuth()
  const { addRecipe } = useRealtime()
  const { addNotification } = useNotifications()
  const [recipes, setRecipes] = useState([])
  const [myRecipes, setMyRecipes] = useState([])
  const [likedRecipes, setLikedRecipes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingRecipe, setDeletingRecipe] = useState(null)
  const [createLoading, setCreateLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [newRecipe, setNewRecipe] = useState({
    title: '',
    description: '',
    ingredients: '',
    instructions: '',
    prep_time: '',
    cook_time: '',
    servings: '',
    difficulty: 'Easy',
    cuisine: '',
    tags: '',
    image_url: '',
    media_type: 'image' as 'image' | 'video'
  })

  useEffect(() => {
    fetchRecipes()
    if (session) {
      fetchMyRecipes()
      fetchLikedRecipes()
    }
  }, [session])

  const fetchRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          *,
          profiles:author_id (name, avatar_url),
          recipe_likes (id),
          recipe_ratings (rating)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })

      if (error) {
        // Handle missing tables gracefully
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn('Recipes table not available. Database setup may be required.')
          setRecipes([])
          return
        }
        console.error('Error fetching recipes:', error)
        return
      }

      const enrichedRecipes = data?.map(recipe => ({
        ...recipe,
        author: recipe.profiles?.name || 'Unknown Chef',
        author_avatar: recipe.profiles?.avatar_url,
        likes_count: recipe.recipe_likes?.length || 0,
        rating_count: recipe.recipe_ratings?.length || 0,
        average_rating: recipe.recipe_ratings?.length > 0 
          ? recipe.recipe_ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / recipe.recipe_ratings.length 
          : 0
      })) || []

      setRecipes(enrichedRecipes)
    } catch (error) {
      console.error('Error fetching recipes:', error)
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  const fetchMyRecipes = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          *,
          recipe_likes (id),
          recipe_ratings (rating)
        `)
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        // Handle missing tables gracefully
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn('Recipes table not available. Database setup may be required.')
          setMyRecipes([])
          return
        }
        console.error('Error fetching my recipes:', error)
        return
      }

      const enrichedRecipes = data?.map(recipe => ({
        ...recipe,
        author: user.name,
        author_avatar: user.avatar_url,
        likes_count: recipe.recipe_likes?.length || 0,
        rating_count: recipe.recipe_ratings?.length || 0,
        average_rating: recipe.recipe_ratings?.length > 0 
          ? recipe.recipe_ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / recipe.recipe_ratings.length 
          : 0
      })) || []

      setMyRecipes(enrichedRecipes)
    } catch (error) {
      console.error('Error fetching my recipes:', error)
      setMyRecipes([])
    }
  }

  const fetchLikedRecipes = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('recipe_likes')
        .select('recipe_id')
        .eq('user_id', user.id)

      if (error) {
        // Handle missing tables gracefully
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn('Recipe likes table not available. Database setup may be required.')
          setLikedRecipes(new Set())
          return
        }
        console.error('Error fetching liked recipes:', error)
        return
      }

      const likedIds = new Set(data?.map(like => like.recipe_id) || [])
      setLikedRecipes(likedIds)
    } catch (error) {
      console.error('Error fetching liked recipes:', error)
      setLikedRecipes(new Set())
    }
  }

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setCreateLoading(true)
    setError('')
    setSuccess('')

    try {
      const recipeData = {
        title: newRecipe.title,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients.split('\n').filter(i => i.trim()),
        instructions: newRecipe.instructions.split('\n').filter(i => i.trim()),
        tags: newRecipe.tags.split(',').map(t => t.trim()).filter(t => t),
        prep_time: parseInt(newRecipe.prep_time) || 0,
        cook_time: parseInt(newRecipe.cook_time) || 0,
        servings: parseInt(newRecipe.servings) || 1,
        difficulty: newRecipe.difficulty.toLowerCase(),
        image_url: newRecipe.image_url,
        media_type: newRecipe.media_type,
        author_id: user.id,
        is_public: true
      }

      // Use the real-time hook to add recipe (which will handle Supabase insert)
      await addRecipe(recipeData)

      // Reset form
      setNewRecipe({
        title: '',
        description: '',
        ingredients: '',
        instructions: '',
        prep_time: '',
        cook_time: '',
        servings: '',
        difficulty: 'Easy',
        cuisine: '',
        tags: '',
        image_url: '',
        media_type: 'image'
      })
      
      setShowCreateDialog(false)
      
      addNotification({
        title: 'Recipe Shared! 🍳',
        message: 'Your recipe has been shared with the community.',
        type: 'success'
      })

      // Refresh data
      await fetchRecipes()
      await fetchMyRecipes()
    } catch (error) {
      setError('An unexpected error occurred')
      console.error('Create recipe error:', error)
      
      addNotification({
        title: 'Error',
        message: 'Failed to share recipe. Please try again.',
        type: 'error'
      })
    } finally {
      setCreateLoading(false)
    }
  }

  const handleEditRecipe = async (recipe: any) => {
    setEditingRecipe(recipe)
    setNewRecipe({
      title: recipe.title,
      description: recipe.description,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients,
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions,
      prep_time: recipe.prep_time?.toString() || '',
      cook_time: recipe.cook_time?.toString() || '',
      servings: recipe.servings?.toString() || '',
      difficulty: recipe.difficulty || 'Easy',
      cuisine: recipe.cuisine || '',
      tags: Array.isArray(recipe.tags) ? recipe.tags.join(', ') : recipe.tags || '',
      image_url: recipe.image_url || '',
      media_type: recipe.media_type || 'image'
    })
    setShowEditDialog(true)
  }

  const handleUpdateRecipe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !editingRecipe) return

    setEditLoading(true)
    setError('')
    setSuccess('')

    try {
      const recipeData = {
        title: newRecipe.title,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients.split('\n').filter(i => i.trim()),
        instructions: newRecipe.instructions.split('\n').filter(i => i.trim()),
        tags: newRecipe.tags.split(',').map(t => t.trim()).filter(t => t),
        prep_time: parseInt(newRecipe.prep_time) || 0,
        cook_time: parseInt(newRecipe.cook_time) || 0,
        servings: parseInt(newRecipe.servings) || 1,
        difficulty: newRecipe.difficulty.toLowerCase(),
        image_url: newRecipe.image_url,
        media_type: newRecipe.media_type
      }

      const { error } = await supabase
        .from('recipes')
        .update(recipeData)
        .eq('id', editingRecipe.id)
        .eq('author_id', user.id) // Ensure only author can edit

      if (error) throw error

      // Reset form and close dialog
      setNewRecipe({
        title: '',
        description: '',
        ingredients: '',
        instructions: '',
        prep_time: '',
        cook_time: '',
        servings: '',
        difficulty: 'Easy',
        cuisine: '',
        tags: '',
        image_url: '',
        media_type: 'image'
      })
      
      setShowEditDialog(false)
      setEditingRecipe(null)
      
      addNotification({
        title: 'Recipe Updated! ✨',
        message: 'Your recipe has been successfully updated.',
        type: 'success'
      })

      // Refresh data
      await fetchRecipes()
      await fetchMyRecipes()
    } catch (error) {
      setError('Failed to update recipe')
      console.error('Update recipe error:', error)
      
      addNotification({
        title: 'Error',
        message: 'Failed to update recipe. Please try again.',
        type: 'error'
      })
    } finally {
      setEditLoading(false)
    }
  }

  const handleDeleteRecipe = async () => {
    if (!user || !deletingRecipe) return

    setDeleteLoading(true)

    try {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', deletingRecipe.id)
        .eq('author_id', user.id) // Ensure only author can delete

      if (error) throw error

      setShowDeleteDialog(false)
      setDeletingRecipe(null)
      
      addNotification({
        title: 'Recipe Deleted! 🗑️',
        message: 'Your recipe has been successfully removed.',
        type: 'success'
      })

      // Refresh data
      await fetchRecipes()
      await fetchMyRecipes()
    } catch (error) {
      console.error('Delete recipe error:', error)
      
      addNotification({
        title: 'Error',
        message: 'Failed to delete recipe. Please try again.',
        type: 'error'
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleLikeRecipe = async (recipeId: string) => {
    if (!user) return

    try {
      const isLiked = likedRecipes.has(recipeId)
      
      if (isLiked) {
        // Unlike
        const { error } = await supabase
          .from('recipe_likes')
          .delete()
          .eq('recipe_id', recipeId)
          .eq('user_id', user.id)

        if (error) throw error

        setLikedRecipes(prev => {
          const newSet = new Set(prev)
          newSet.delete(recipeId)
          return newSet
        })
      } else {
        // Like
        const { error } = await supabase
          .from('recipe_likes')
          .insert({
            recipe_id: recipeId,
            user_id: user.id
          })

        if (error) throw error

        setLikedRecipes(prev => new Set([...prev, recipeId]))

        // Try to add activity for the recipe author
        const recipe = recipes.find(r => r.id === recipeId)
        if (recipe && recipe.author_id !== user.id) {
          try {
            await supabase.from('activities').insert({
              user_id: recipe.author_id,
              type: 'recipe_liked',
              description: `${user.name} liked your recipe "${recipe.title}"`
            })
          } catch (activityError) {
            console.warn('Activities table not available:', activityError)
          }
        }
      }

      // Update recipe counts locally
      setRecipes(prev => prev.map(recipe => 
        recipe.id === recipeId 
          ? { ...recipe, likes_count: isLiked ? recipe.likes_count - 1 : recipe.likes_count + 1 }
          : recipe
      ))

      setMyRecipes(prev => prev.map(recipe => 
        recipe.id === recipeId 
          ? { ...recipe, likes_count: isLiked ? recipe.likes_count - 1 : recipe.likes_count + 1 }
          : recipe
      ))

    } catch (error) {
      console.error('Error toggling like:', error)
      addNotification({
        title: 'Error',
        message: 'Failed to update like. Please try again.',
        type: 'error'
      })
    }
  }

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.cuisine?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-100 text-green-800'
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'Hard':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const RecipeCard = ({ recipe, showActions = false }: { recipe: any, showActions?: boolean }) => {
    const isLiked = likedRecipes.has(recipe.id)
    
    return (
      <Card className="glass-card hover:shadow-lg transition-all duration-300 group overflow-hidden">
        <div onClick={() => setSelectedRecipe(recipe)} className="cursor-pointer">
          <div className="aspect-video w-full bg-accent rounded-t-lg overflow-hidden relative">
            {recipe.image_url ? (
              recipe.media_type === 'video' ? (
                <video
                  src={recipe.image_url}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  muted
                  loop
                  onMouseEnter={(e) => e.currentTarget.play()}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                />
              ) : (
                <RecipeCardImage
                  src={recipe.image_url}
                  alt={recipe.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100">
                <ChefHat className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
            {recipe.average_rating > 0 && (
              <div className="absolute top-3 left-3 glass-card px-2 py-1 rounded-full">
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">{recipe.average_rating.toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold line-clamp-1 text-lg">{recipe.title}</h3>
                <Badge className={getDifficultyColor(recipe.difficulty)} variant="secondary">
                  {recipe.difficulty}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {recipe.description}
              </p>
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {recipe.servings} servings
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {recipe.rating_count || 0} reviews
                </div>
              </div>
              
              {recipe.tags && recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recipe.tags.slice(0, 3).map((tag: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {recipe.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{recipe.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </div>
        
        {/* Action Bar */}
        <div className="px-4 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>by {recipe.author}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Like button for other users' recipes */}
            {user && user.id !== recipe.author_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleLikeRecipe(recipe.id)
                }}
                className={`h-8 px-2 transition-colors ${
                  isLiked 
                    ? 'text-red-500 hover:text-red-600' 
                    : 'text-muted-foreground hover:text-red-500'
                }`}
              >
                {isLiked ? (
                  <Heart className="h-4 w-4 fill-current" />
                ) : (
                  <Heart className="h-4 w-4" />
                )}
                <span className="ml-1 text-xs">{recipe.likes_count || 0}</span>
              </Button>
            )}

            {/* Edit/Delete options for recipe author */}
            {user && user.id === recipe.author_id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 p-0 hover:bg-white/20"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-modal border-glass-border">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditRecipe(recipe)
                    }}
                    className="cursor-pointer hover:bg-white/10"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Recipe
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingRecipe(recipe)
                      setShowDeleteDialog(true)
                    }}
                    className="cursor-pointer hover:bg-white/10 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Recipe
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Show likes count for own recipes */}
            {user && user.id === recipe.author_id && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Heart className="h-4 w-4" />
                <span className="text-xs">{recipe.likes_count || 0}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-48 w-full rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const CreateRecipeForm = ({ onSubmit, loading }: { onSubmit: (e: React.FormEvent) => void, loading: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">Recipe Title *</Label>
          <Input
            id="title"
            value={newRecipe.title}
            onChange={(e) => setNewRecipe(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Delicious Pasta Carbonara"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cuisine">Cuisine Type</Label>
          <Input
            id="cuisine"
            value={newRecipe.cuisine}
            onChange={(e) => setNewRecipe(prev => ({ ...prev, cuisine: e.target.value }))}
            placeholder="Italian, Mexican, Asian..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={newRecipe.description}
          onChange={(e) => setNewRecipe(prev => ({ ...prev, description: e.target.value }))}
          placeholder="A brief description of your recipe..."
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="prep_time">Prep Time (minutes)</Label>
          <Input
            id="prep_time"
            type="number"
            value={newRecipe.prep_time}
            onChange={(e) => setNewRecipe(prev => ({ ...prev, prep_time: e.target.value }))}
            placeholder="15"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cook_time">Cook Time (minutes)</Label>
          <Input
            id="cook_time"
            type="number"
            value={newRecipe.cook_time}
            onChange={(e) => setNewRecipe(prev => ({ ...prev, cook_time: e.target.value }))}
            placeholder="30"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="servings">Servings</Label>
          <Input
            id="servings"
            type="number"
            value={newRecipe.servings}
            onChange={(e) => setNewRecipe(prev => ({ ...prev, servings: e.target.value }))}
            placeholder="4"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ingredients">Ingredients * (one per line)</Label>
        <Textarea
          id="ingredients"
          value={newRecipe.ingredients}
          onChange={(e) => setNewRecipe(prev => ({ ...prev, ingredients: e.target.value }))}
          placeholder="1 cup pasta&#10;2 eggs&#10;1/2 cup parmesan cheese..."
          rows={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions * (one step per line)</Label>
        <Textarea
          id="instructions"
          value={newRecipe.instructions}
          onChange={(e) => setNewRecipe(prev => ({ ...prev, instructions: e.target.value }))}
          placeholder="Boil water in a large pot&#10;Cook pasta until al dente&#10;Mix eggs and cheese..."
          rows={8}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma separated)</Label>
        <Input
          id="tags"
          value={newRecipe.tags}
          onChange={(e) => setNewRecipe(prev => ({ ...prev, tags: e.target.value }))}
          placeholder="pasta, quick, dinner, italian"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="difficulty">Difficulty</Label>
        <select
          id="difficulty"
          value={newRecipe.difficulty}
          onChange={(e) => setNewRecipe(prev => ({ ...prev, difficulty: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
      </div>

      <OptimizedMediaUpload
        onMediaChange={(url, mediaType) => setNewRecipe(prev => ({ 
          ...prev, 
          image_url: url,
          media_type: mediaType
        }))}
        currentMedia={newRecipe.image_url}
        currentMediaType={newRecipe.media_type}
        label="Recipe Media (Auto-Optimized)"
        bucket="recipes"
        allowVideo={true}
        allowImage={true}
        enableOptimization={true}
        targetImageWidth={1200}
        compressionQuality={0.85}
        maxSizeMB={5}
      />

      <div className="flex justify-end gap-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => {
            setShowCreateDialog(false)
            setShowEditDialog(false)
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (editingRecipe ? 'Updating...' : 'Creating...') : (editingRecipe ? 'Update Recipe' : 'Share Recipe')}
        </Button>
      </div>
    </form>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Recipe Collection</h1>
          <p className="text-muted-foreground">Discover and share amazing recipes with the community</p>
        </div>
        
        {session && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Share Recipe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-modal">
              <DialogHeader>
                <DialogTitle>Share Your Recipe</DialogTitle>
                <DialogDescription>
                  Share your culinary creation with the ACWhisk community
                </DialogDescription>
              </DialogHeader>
              
              {(error || success) && (
                <Alert className={success ? 'border-green-200 bg-green-50' : ''}>
                  <AlertDescription className={success ? 'text-green-800' : ''}>
                    {error || success}
                  </AlertDescription>
                </Alert>
              )}

              <CreateRecipeForm onSubmit={handleCreateRecipe} loading={createLoading} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes, cuisine, ingredients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">All Recipes ({filteredRecipes.length})</TabsTrigger>
          {session && <TabsTrigger value="mine">My Recipes ({myRecipes.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          {filteredRecipes.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No recipes found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'Try adjusting your search terms' : 'Be the first to share a recipe!'}
              </p>
              {session && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  Share Your First Recipe
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRecipes.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
        </TabsContent>

        {session && (
          <TabsContent value="mine" className="space-y-6">
            {myRecipes.length === 0 ? (
              <div className="text-center py-12">
                <Upload className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No recipes yet</h3>
                <p className="text-muted-foreground mb-4">
                  Share your first recipe with the community
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  Share Recipe
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myRecipes.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} showActions />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Recipe Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-modal">
          <DialogHeader>
            <DialogTitle>Edit Recipe</DialogTitle>
            <DialogDescription>
              Update your recipe details
            </DialogDescription>
          </DialogHeader>
          
          {(error || success) && (
            <Alert className={success ? 'border-green-200 bg-green-50' : ''}>
              <AlertDescription className={success ? 'text-green-800' : ''}>
                {error || success}
              </AlertDescription>
            </Alert>
          )}

          <CreateRecipeForm onSubmit={handleUpdateRecipe} loading={editLoading} />
        </DialogContent>
      </Dialog>

      {/* Delete Recipe Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingRecipe?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecipe}
              disabled={deleteLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete Recipe'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recipe Detail Dialog */}
      {selectedRecipe && (
        <Dialog open={!!selectedRecipe} onOpenChange={() => setSelectedRecipe(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass-modal">
            <DialogHeader>
              <DialogTitle className="text-2xl">{selectedRecipe.title}</DialogTitle>
              <DialogDescription>
                by {selectedRecipe.author} • {selectedRecipe.difficulty} • 
                {(selectedRecipe.prep_time || 0) + (selectedRecipe.cook_time || 0)} minutes
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Recipe Image/Video */}
              {selectedRecipe.image_url && (
                <div className="aspect-video w-full rounded-lg overflow-hidden">
                  {selectedRecipe.media_type === 'video' ? (
                    <video
                      src={selectedRecipe.image_url}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <OptimizedImage
                      src={selectedRecipe.image_url}
                      alt={selectedRecipe.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}

              {/* Recipe Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 glass-card rounded-lg">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Prep Time</p>
                  <p className="font-semibold">{selectedRecipe.prep_time || 0} min</p>
                </div>
                <div className="text-center p-4 glass-card rounded-lg">
                  <ChefHat className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Cook Time</p>
                  <p className="font-semibold">{selectedRecipe.cook_time || 0} min</p>
                </div>
                <div className="text-center p-4 glass-card rounded-lg">
                  <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Servings</p>
                  <p className="font-semibold">{selectedRecipe.servings || 1}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground">{selectedRecipe.description}</p>
              </div>

              {/* Tags */}
              {selectedRecipe.tags && selectedRecipe.tags.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedRecipe.tags.map((tag: string, index: number) => (
                      <Badge key={index} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Ingredients */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Ingredients</h3>
                <ul className="space-y-2">
                  {(Array.isArray(selectedRecipe.ingredients) ? selectedRecipe.ingredients : [selectedRecipe.ingredients]).map((ingredient: string, index: number) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      <span>{ingredient}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Instructions */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Instructions</h3>
                <ol className="space-y-3">
                  {(Array.isArray(selectedRecipe.instructions) ? selectedRecipe.instructions : [selectedRecipe.instructions]).map((instruction: string, index: number) => (
                    <li key={index} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Rating and Reviews */}
              <RecipeRatingReview 
                recipeId={selectedRecipe.id} 
                currentUserId={user?.id} 
                recipeAuthorId={selectedRecipe.author_id}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}