import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDashboardStore } from '../store/dashboardSlice';
import {
  fetchDashboards,
  fetchDashboardData,
  createDashboard,
  createWidget,
  duplicateDashboard,
  shareDashboard
} from '../services/api';
import DashboardGrid from '../components/Dashboard/DashboardGrid';
import WidgetContainer from '../components/Dashboard/WidgetContainer';
import CreateDashboardModal from '../components/Dashboard/CreateDashboardModal';
import AddWidgetModal from '../components/Dashboard/AddWidgetModal';

export default function Dashboard() {
  const { dashboardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { dashboards, currentDashboard, setDashboards, setCurrentDashboard } =
    useDashboardStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Fetch all dashboards
  const { data: dashboardsData, isLoading: loadingDashboards } = useQuery({
    queryKey: ['dashboards'],
    queryFn: fetchDashboards,
  });

  // Fetch specific dashboard
  const { data: dashboardData, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: async () => {
      const { dashboard, widgetData } = await fetchDashboardData(dashboardId!);
      const dataByWidget = new Map(widgetData.map(item => [item.widgetId, item.data]));
      return {
        ...dashboard,
        widgets: dashboard.widgets.map(widget => ({ ...widget, data: dataByWidget.get(widget.id) })),
      };
    },
    enabled: !!dashboardId,
  });
  useEffect(() => {
    if (dashboardsData) {
      setDashboards(dashboardsData);
    }
  }, [dashboardsData]);

  useEffect(() => {
    if (dashboardData) {
      setCurrentDashboard(dashboardData);
    }
  }, [dashboardData]);

  // Create dashboard mutation
  const createMutation = useMutation({
    mutationFn: createDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setShowCreateModal(false);
    },
  });
  const handleCreateDashboard = (data: { name: string; description?: string }) => {
    createMutation.mutate(data);
  };

  // Create widget mutation
  const createWidgetMutation = useMutation({
    mutationFn: (data: { name: string; type: string; config: any }) =>
      createWidget(dashboardId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setShowAddWidgetModal(false);
    },
  });
  const handleAddWidget = (data: { name: string; type: string; config: any }) => {
    createWidgetMutation.mutate(data);
  };

  // Intentional flaw: Duplicate doesn't redirect to new dashboard
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateDashboard(dashboardId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      // Intentional flaw: not navigating to the new dashboard
      console.log('Dashboard duplicated:', data.id);
    },
  });

  // Share dashboard mutation
  const shareMutation = useMutation({
    mutationFn: () => shareDashboard(dashboardId!, { isPublic: true }),
    onSuccess: (data) => {
      // Intentional flaw: Share URL shown but no copy button
      setShareUrl(`${window.location.origin}/shared/${data.shareId}`);
    },
  });
  if (loadingDashboards) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboards...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboards</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Create Dashboard
        </button>
      </div>

      {!dashboardId ? (
        // Dashboard list
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((dashboard) => (
            <a
              key={dashboard.id}
              href={`/dashboard/${dashboard.id}`}
              className="block bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <h2 className="text-lg font-semibold">{dashboard.name}</h2>
              <p className="text-gray-500 text-sm mt-1">
                {dashboard.description || 'No description'}
              </p>
              <div className="mt-2 text-sm text-gray-400">
                {dashboard._count?.widgets || 0} widgets
              </div>
            </a>
          ))}

          {dashboards.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No dashboards yet. Create your first dashboard to get started.
            </div>
          )}
        </div>
      ) : loadingDashboard ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      ) : currentDashboard ? (
        // Dashboard view
        <div>
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold">{currentDashboard.name}</h2>
              {currentDashboard.description && (
                <p className="text-gray-500">{currentDashboard.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending}
                className="border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50"
              >
                {duplicateMutation.isPending ? 'Duplicating...' : 'Duplicate'}
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50"
              >
                Share
              </button>
              <button
                onClick={() => setShowAddWidgetModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Add Widget
              </button>
            </div>
          </div>

          <DashboardGrid dashboardId={currentDashboard.id}>
            {currentDashboard.widgets.map((widget) => (
              <WidgetContainer
                key={widget.id}
                widget={widget}
                dashboardId={currentDashboard.id}
              />
            ))}
          </DashboardGrid>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          Dashboard not found
        </div>
      )}

      {showCreateModal && (
        <CreateDashboardModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateDashboard}
          isLoading={createMutation.isPending}
        />
      )}

      {showAddWidgetModal && (
        <AddWidgetModal
          onClose={() => setShowAddWidgetModal(false)}
          onSubmit={handleAddWidget}
          isLoading={createWidgetMutation.isPending}
        />
      )}

      {/* Share Modal - Intentional flaw: no copy button for share URL */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Share Dashboard</h2>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareUrl(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {shareUrl ? (
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Anyone with this link can view the dashboard:
                  </p>
                  {/* Intentional flaw: URL shown but no copy button */}
                  <div className="font-mono text-sm bg-gray-100 p-3 rounded break-all">
                    {shareUrl}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-600 mb-4">
                    Create a public link to share this dashboard with anyone.
                  </p>
                  <button
                    onClick={() => shareMutation.mutate()}
                    disabled={shareMutation.isPending}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {shareMutation.isPending ? 'Creating Link...' : 'Create Share Link'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
