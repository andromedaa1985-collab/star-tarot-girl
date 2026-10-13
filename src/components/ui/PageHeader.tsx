import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageHeader({ eyebrow, title, description, action, backTo }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  backTo?: string;
}) {
  return (
    <header className="rail-page-header">
      <div className="min-w-0">
        {backTo && <Link to={backTo} className="rail-back"><ArrowLeft size={16} aria-hidden="true" />返回</Link>}
        {eyebrow && <p className="rail-eyebrow">{eyebrow}</p>}
        <h1 className="rail-page-title">{title}</h1>
        {description && <p className="rail-page-description">{description}</p>}
      </div>
      {action && <div className="rail-header-action">{action}</div>}
    </header>
  );
}
