/**
 * Card component
 * Based on shadcn/ui Card
 */

import styles from './Card.module.css';

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`${styles.card} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`${styles.header} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', as: Component = 'h3', children, ...props }) {
  return (
    <Component className={`${styles.title} ${className}`} {...props}>
      {children}
    </Component>
  );
}

export function CardDescription({ className = '', children, ...props }) {
  return (
    <p className={`${styles.description} ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className = '', children, ...props }) {
  return (
    <div className={`${styles.content} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`${styles.footer} ${className}`} {...props}>
      {children}
    </div>
  );
}
