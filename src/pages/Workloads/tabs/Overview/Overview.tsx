import { EmbeddedScene, PanelBuilders, SceneFlexItem, SceneFlexLayout, SceneQueryRunner } from "@grafana/scenes"
import { LegendDisplayMode, StackingMode } from "@grafana/schema"
import Analytics from "components/Analytics"

function createPodsPanel() {
    return PanelBuilders.timeseries()
        .setTitle('Pods By Status')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'pods',
                    expr: `sum(
                            kube_pod_status_phase{
                                spoke="$spoke"
                            }
                        ) by (phase)
                    `,
                    legendFormat: 'Pods - {{phase}}',
                },
            ],
        }))
        .setOption('legend', { displayMode: LegendDisplayMode.Table, calcs: ['mean', 'last', 'max'] })
        .setCustomFieldConfig('stacking', { mode: StackingMode.Normal })
        .setCustomFieldConfig('fillOpacity', 50)
        .build()
}

function createPodsByOwnerKindPanel() {
    return PanelBuilders.timeseries()
        .setTitle('Pods By Owner Kind')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'pods',
                    expr: `count(
                            kube_pod_info{
                                spoke="$spoke"
                            }
                        ) by (created_by_kind)
                    `,
                    legendFormat: 'Pods - {{created_by_kind}}',
                },
            ],
        }))
        .setOption('legend', { displayMode: LegendDisplayMode.Table, calcs: ['mean', 'last', 'max'] })
        .setCustomFieldConfig('stacking', { mode: StackingMode.Normal })
        .setCustomFieldConfig('fillOpacity', 50)
        .build()
}


function createDeploymentsPanel() {
    return PanelBuilders.stat()
        .setTitle('Deployments')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'deployments',
                    expr: `count(
                            kube_deployment_created{
                                spoke="$spoke"
                            }
                        )
                    `,
                    legendFormat: 'Deployments',
                },
            ],
        }))
        .build()
}

function createStatefulsetsPanel() {
    return PanelBuilders.stat()
        .setTitle('Statefulsets')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'statefulsets',
                    expr: `count(
                            kube_statefulset_created{
                                spoke="$spoke"
                            }
                        )
                    `,
                    legendFormat: 'Statefulset',
                },
            ],
        }))
        .build()
}

function createDaemonsetsPanel() {
    return PanelBuilders.stat()
        .setTitle('Daemonsets')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'statefulsets',
                    expr: `count(
                            kube_daemonset_created{
                                spoke="$spoke"
                            }
                        )
                    `,
                    legendFormat: 'Statefulset',
                },
            ],
        }))
        .build()
}

function createCronjobsPanel() {
    return PanelBuilders.stat()
        .setTitle('Cronjobs')
        .setData(new SceneQueryRunner({
            datasource: {
                uid: '$datasource',
                type: 'prometheus',
            },
            queries: [
                {
                    refId: 'cronjobs',
                    expr: `count(
                            kube_cronjob_created{
                                spoke="$spoke"
                            }
                        )
                    `,
                    legendFormat: 'Cronjobs',
                },
            ],
        }))
        .build()

}

export const getOverviewScene = () => {
    return new EmbeddedScene({
        body: new Analytics({
            viewName: 'Workloads - Overview',
            children: [
                new SceneFlexLayout({
                    direction: 'column',
                    children: [
                        new SceneFlexLayout({
                            direction: 'row',
                            height: 300,
                            children: [
                                new SceneFlexItem({
                                    body: createDeploymentsPanel(),
                                }),
                                new SceneFlexItem({
                                    body: createStatefulsetsPanel(),
                                }),
                                new SceneFlexItem({
                                    body: createDaemonsetsPanel(),
                                }),
                                new SceneFlexItem({
                                    body: createCronjobsPanel(),
                                }),
                            ]
                        }),
                        new SceneFlexLayout({
                            direction: 'row',
                            height: 400,
                            children: [
                                new SceneFlexItem({
                                    body: createPodsPanel(),
                                }),
                                new SceneFlexItem({
                                    body: createPodsByOwnerKindPanel(),
                                }),
                            ]
                        }),
                    ],
                }),
            ],
        }),
    })
}
