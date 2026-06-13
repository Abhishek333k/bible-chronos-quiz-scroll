const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data: quizzes } = await supabase.from('quizzes').select('*');
  const targetQuiz = quizzes.find(q => q.title.includes('50Q @ Acts 13,14,15'));
  
  if (!targetQuiz) return console.log("Not found");
  
  const { data: questions } = await supabase.from('questions').select('id, sort_order, question_text, created_at, image_url').eq('quiz_id', targetQuiz.id).order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
  for (let i = 0; i < questions.length; i++) {
    console.log(`Idx=${i+1} | SortOrder=${questions[i].sort_order} | CreatedAt=${questions[i].created_at} | ID=${questions[i].id.substring(0,6)}`);
  }
}
check();
