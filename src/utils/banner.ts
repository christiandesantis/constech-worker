import figlet from 'figlet';
import chalk from 'chalk';
import chalkAnimation from 'chalk-animation';

export async function showAnimatedBanner(text: string = 'Constech Worker'): Promise<void> {
  return new Promise((resolve) => {
    // Create ASCII art
    figlet.text(text, {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 120,
      whitespaceBreak: true
    }, (err, data) => {
      if (err) {
        console.log('Something went wrong with banner...');
        resolve();
        return;
      }

      if (!data) {
        resolve();
        return;
      }

      // Add proper spacing before banner
      console.log('');
      console.log('');
      console.log('');
      
      // Use a simple purple-blue color (Medium Slate Blue)
      // Note: Colors may not show when output is piped. Run directly to see colors.
      console.log(chalk.hex('#7B68EE')(data));
      
      // Add animated subtitle
      const subtitle = '✨ Autonomous Development • Powered by Claude Code ✨';
      
      console.log('');
      const centeredSubtitle = ' '.repeat(Math.max(0, (data.split('\n')[0]?.length || 80) / 2 - subtitle.length / 2)) + subtitle;
      
      // Animate the subtitle with a neon effect (works better with colors)
      const animation = chalkAnimation.neon(centeredSubtitle);
      
      // Stop animation after 2.5 seconds
      setTimeout(() => {
        animation.stop();
        console.log('\n');
        resolve();
      }, 2500);
    });
  });
}

export async function showQuickBanner(): Promise<void> {
  return new Promise((resolve) => {
    figlet.text('Constech', {
      font: 'Small',
      horizontalLayout: 'fitted',
      verticalLayout: 'default'
    }, (err, data) => {
      if (err || !data) {
        console.log('🤖 Constech Worker\n');
        resolve();
        return;
      }

      // Add proper spacing before banner
      console.log('');
      console.log('');
      
      // Use simple purple-blue color
      console.log(chalk.hex('#7B68EE')(data));
      console.log(chalk.hex('#7B68EE')(' Worker • Autonomous Development\n'));
      resolve();
    });
  });
}

// Alternative fonts that work well:
// - 'ANSI Shadow' (dramatic, good for main banner)
// - 'Big' (classic, readable)  
// - 'Slant' (modern, slanted)
// - 'Small' (compact, good for quick display)
// - 'Standard' (simple, clean)
// - '3D Diagonal' (dimensional effect)
// - 'Blocks' (solid, bold)

export const bannerFonts = {
  dramatic: 'ANSI Shadow',
  classic: 'Big',
  modern: 'Slant', 
  compact: 'Small',
  simple: 'Standard',
  dimensional: '3D Diagonal',
  bold: 'Blocks'
} as const;