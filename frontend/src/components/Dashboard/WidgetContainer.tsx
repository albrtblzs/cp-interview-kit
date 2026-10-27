import { useState, useCallback, memo, forwardRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { deleteWidget, fetchComments, createComment, deleteComment } from '../../services/api';
import ChartWidget from '../Charts/ChartWidget';
import MetricWidget from '../Charts/MetricWidget';
import TableWidget from '../Charts/TableWidget';

interface Widget {
  id: string;
  name: string;
  type: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
  data?: any;
}

interface WidgetContainerProps {
  widget: Widget;
  dashboardId: string;
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  children?: React.ReactNode;
}

const WidgetContainer = memo(forwardRef<HTMLDivElement, WidgetContainerProps>(function WidgetContainer({
  widget,
  dashboardId,
  style,
  className,
  onMouseDown,
  onMouseUp,
  onTouchEnd,
  children,
}, ref) {
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');

  // Intentional flaw: Comments fetched separately for each widget (N+1)
  const { data: comments, refetch: refetchComments } = useQuery({
    queryKey: ['comments', 'widget', widget.id],
    queryFn: () => fetchComments('widget', widget.id),
    enabled: showComments,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWidget(dashboardId, widget.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  // Intentional flaw: No optimistic updates for comments
  const addCommentMutation = useMutation({
    mutationFn: (content: string) => createComment({
      resourceType: 'widget',
      resourceId: widget.id,
      content,
    }),
    onSuccess: () => {
      setNewComment('');
      refetchComments();
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      refetchComments();
    },
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this widget?')) {
      deleteMutation.mutate();
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment);
    }
  };

  const renderWidgetContent = useCallback(() => {
    switch (widget.type) {
      case 'chart':
        return <ChartWidget config={widget.config} data={widget.data} />;
      case 'metric':
        return <MetricWidget config={widget.config} data={widget.data} />;
      case 'table':
        return <TableWidget config={widget.config} data={widget.data} />;
      case 'text':
        return (
          <div className="p-4">
            {}
            <div dangerouslySetInnerHTML={{ __html: widget.config?.content || '' }} />
          </div>
        );
      default:
        return <div className="p-4 text-gray-500">Unknown widget type</div>;
    }
  }, [widget.type, widget.config, widget.data]);

  return (
    <div
      ref={ref}
      style={style}
      className={`bg-white rounded-lg shadow h-full flex flex-col ${className || ''}`}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b cursor-move bg-gray-50 rounded-t-lg">
        <h3 className="font-medium text-sm truncate">{widget.name}</h3>
        <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 mt-1 w-32 bg-white rounded shadow-lg z-20">
                <button
                  onClick={() => {
                    setShowComments(!showComments);
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  {showComments ? 'Hide Comments' : 'Comments'}
                </button>
                <button
                  onClick={() => {
                    handleDelete();
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {renderWidgetContent()}
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="border-t p-2 max-h-40 overflow-y-auto bg-gray-50" onMouseDown={(e) => e.stopPropagation()}>
          <div className="text-xs font-medium text-gray-500 mb-2">Comments</div>
          <div className="space-y-2 mb-2">
            {comments?.map((comment: any) => (
              <div key={comment.id} className="text-xs bg-white p-2 rounded border">
                <div className="flex justify-between items-start">
                  <span className="font-medium">{comment.userName || 'User'}</span>
                  <button
                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    &times;
                  </button>
                </div>
                <p className="text-gray-600 mt-1">{comment.content}</p>
              </div>
            ))}
            {(!comments || comments.length === 0) && (
              <div className="text-xs text-gray-400">No comments yet</div>
            )}
          </div>
          <form onSubmit={handleAddComment} className="flex gap-1">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 text-xs px-2 py-1 border rounded"
            />
            <button
              type="submit"
              disabled={addCommentMutation.isPending}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
      )}

      {/* Loading overlay */}
      {deleteMutation.isPending && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-gray-500">Deleting...</div>
        </div>
      )}
      {children}
    </div>
  );
}));

export default WidgetContainer;
