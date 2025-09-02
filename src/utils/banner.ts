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
      
      // Create a custom color-cycling effect through purple-blue spectrum
      const purpleBlueGradient = [
        '#8A2BE2', // BlueViolet
        '#9932CC', // DarkOrchid
        '#9370DB', // MediumSlateBlue
        '#8470FF', // LightSlateBlue
        '#7B68EE', // MediumSlateBlue
        '#6495ED', // CornflowerBlue
        '#4169E1', // RoyalBlue
        '#6495ED', // CornflowerBlue
        '#7B68EE', // MediumSlateBlue
        '#8470FF', // LightSlateBlue
        '#9370DB', // MediumSlateBlue
        '#9932CC'  // DarkOrchid
      ];
      
      let colorIndex = 0;
      
      const cycleColors = () => {
        const currentColor = purpleBlueGradient[colorIndex];
        const coloredData = chalk.hex(currentColor)(data);
        
        // Simpler approach - move cursor to start, clear lines, and print normally
        const lines = data.split('\n');
        // Move cursor up to the beginning of the ASCII art (adjust by 1 to account for console.log behavior)
        process.stdout.write(`\u001b[${lines.length + 1}A`);
        // Move cursor to beginning of line
        process.stdout.write('\r');
        // Clear from cursor to end of screen to avoid artifacts
        process.stdout.write('\u001b[0J');
        // Now print the colored data normally with console.log
        console.log(coloredData);
        
        colorIndex = (colorIndex + 1) % purpleBlueGradient.length;
      };
      
      // Show initial state
      console.log(chalk.hex(purpleBlueGradient[0])(data));
      
      // Start color cycling
      const colorInterval = setInterval(cycleColors, 150);
      
      // Add animated subtitle after a brief delay
      setTimeout(() => {
        const subtitle = '✨ Autonomous Development • Powered by Claude Code ✨';
        console.log('');
        const centeredSubtitle = ' '.repeat(Math.max(0, (data.split('\n')[0]?.length || 80) / 2 - subtitle.length / 2)) + subtitle;
        
        // Animate the subtitle with a neon effect
        const subtitleAnimation = chalkAnimation.neon(centeredSubtitle);
        
        // Stop both animations after total 3 seconds
        setTimeout(() => {
          clearInterval(colorInterval);
          subtitleAnimation.stop();
          console.log('\n');
          resolve();
        }, 2000);
      }, 1000);
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

export async function showCompactAnimatedBanner(): Promise<void> {
  return new Promise((resolve) => {
    // Use figlet to create a compact banner - revert to Small font since ANSI Shadow can't be properly scaled
    figlet.text('Constech Worker', {
      font: 'Small',
      horizontalLayout: 'fitted', 
      verticalLayout: 'default'
    }, (err, data) => {
      if (err || !data) {
        // Fallback to manual compact banner with purple-blue gradient
        console.log('');
        const fallbackText = '🤖 CONSTECH WORKER • Autonomous Development ✨';
        
        // Same purple-blue gradient colors as main banner
        const purpleBlueGradient = [
          '#8A2BE2', '#9932CC', '#9370DB', '#8470FF', '#7B68EE', '#6495ED', 
          '#4169E1', '#6495ED', '#7B68EE', '#8470FF', '#9370DB', '#9932CC'
        ];
        
        let colorIndex = 0;
        const cycleColors = () => {
          const currentColor = purpleBlueGradient[colorIndex];
          // Clear previous line and rewrite
          process.stdout.write('\u001b[1A\r\u001b[0J');
          console.log(chalk.hex(currentColor)(fallbackText));
          colorIndex = (colorIndex + 1) % purpleBlueGradient.length;
        };
        
        // Show initial state
        console.log(chalk.hex(purpleBlueGradient[0])(fallbackText));
        const colorInterval = setInterval(cycleColors, 150);
        
        // Stop after 2 seconds
        setTimeout(() => {
          clearInterval(colorInterval);
          console.log('');
          resolve();
        }, 2000);
        return;
      }

      // Use the figlet output with same purple-blue gradient animation as main banner
      console.log('');
      
      // Use the full figlet output since we're back to Small font
      
      // Same purple-blue gradient colors as main banner
      const purpleBlueGradient = [
        '#8A2BE2', '#9932CC', '#9370DB', '#8470FF', '#7B68EE', '#6495ED', 
        '#4169E1', '#6495ED', '#7B68EE', '#8470FF', '#9370DB', '#9932CC'
      ];
      
      let colorIndex = 0;
      const cycleColors = () => {
        const currentColor = purpleBlueGradient[colorIndex];
        const coloredData = chalk.hex(currentColor)(data);
        
        // Use same cursor positioning technique as main banner
        const dataLines = data.split('\n');
        process.stdout.write(`\u001b[${dataLines.length + 1}A`);
        process.stdout.write('\r');
        process.stdout.write('\u001b[0J');
        console.log(coloredData);
        
        colorIndex = (colorIndex + 1) % purpleBlueGradient.length;
      };
      
      // Show initial state
      console.log(chalk.hex(purpleBlueGradient[0])(data));
      
      // Start color cycling with same timing as main banner
      const colorInterval = setInterval(cycleColors, 150);
      
      // Add subtitle with same style
      setTimeout(() => {
        const subtitle = '⚡ Autonomous Development ⚡';
        const subtitleAnimation = chalkAnimation.neon(chalk.hex('#7B68EE')(subtitle));
        
        // Stop both animations after 1.5 seconds (shorter than main banner)
        setTimeout(() => {
          clearInterval(colorInterval);
          subtitleAnimation.stop();
          console.log('');
          resolve();
        }, 1000);
      }, 500);
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