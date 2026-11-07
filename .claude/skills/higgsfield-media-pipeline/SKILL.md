---
name: higgsfield-media-pipeline
description: Orchestrate Higgsfield MCP to generate dark-luxury B&W/gold promotional videos during development and automate strain video generation inside the admin panel.
---
# Higgsfield MCP Media Pipeline Skill

## Prompting Formula for 420 Cartel Visuals
Whenever invoking the Higgsfield MCP tool for hero backgrounds or strain showcase reels, enforce this visual prompt structure:
> "Ultra-cinematic macro commercial shot, pitch-black obsidian studio background, dramatic rim lighting with warm 24k metallic gold (#D4AF37) dust and highlights, stark high-contrast black and white monochrome grading with selective gold accents, slow-motion 120fps camera orbit, luxury streetwear cartel aesthetic, shot on ARRI Alexa 65 Macro lens."

## Admin Auto-Reel Workflow
When an admin creates or updates a product in `/admin/inventory`:
1. Provide a **"Generate Cartel Promo Reel (Higgsfield)"** button.
2. Construct a scene prompt combining the strain name, category (`Flower`, `Elixir/ml`, `Pre-Roll`), and terpene notes with the 420 Cartel B&W + Gold visual formula.
3. Store the returned job ID in `product_media_jobs`, poll/webhook to completion, and save the final `.mp4` URL directly to the strain's gallery in Supabase.
